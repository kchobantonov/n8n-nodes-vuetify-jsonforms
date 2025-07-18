import isbot from "isbot";
import { DateTime } from "luxon";
import {
  GenericValue,
  IDataObject,
  INodeExecutionData,
  INodeProperties,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  NodeConnectionType,
} from "n8n-workflow";

import {
  formRespondMode,
  respondWithOptions,
  webhookPath,
} from "./common.description";
import { WebhookAuthorizationError } from "./error";
import { FORM_TRIGGER_AUTHENTICATION_PROPERTY } from "./interfaces";
import {
  validateResponseModeConfiguration,
  validateWebhookAuthentication,
} from "./utils";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import keywords from "ajv-keywords";

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false,
  addUsedSchema: false,
  useDefaults: true,
  $data: true,
  discriminator: true,
});
addFormats(ajv);
keywords(ajv);

const useWorkflowTimezone: INodeProperties = {
  displayName: "Use Workflow Timezone",
  name: "useWorkflowTimezone",
  type: "boolean",
  default: false,
  description:
    "Whether to use the workflow timezone set in node's settings rather than UTC",
};

export class VuetifyJsonFormsTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Vuetify JsonForms Form Trigger",
    name: "vuetifyJsonFormsTrigger",
    icon: { light: "file:jsonforms.png", dark: "file:jsonforms.png" },
    group: ["trigger"],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["path"]}}',
    description: "Creates a form using JsonForms Vuetify WebComponent",
    defaults: {
      name: "On form submission",
    },
    inputs: [],
    outputs: [NodeConnectionType.Main],
    webhooks: [
      {
        name: "setup",
        httpMethod: "GET",
        responseMode: "onReceived",
        isFullPath: true,
        path: '={{ $parameter["path"] || $parameter["options"]?.path || $webhookId }}',
        ndvHideUrl: true,
        nodeType: "form",
      },
      {
        name: "default",
        httpMethod: "POST",
        responseMode: '={{$parameter["responseMode"]}}',
        responseData:
          '={{$parameter["responseMode"] === "lastNode" ? "noData" : undefined}}',
        isFullPath: true,
        path: '={{ $parameter["path"] || $parameter["options"]?.path || $webhookId }}',
        ndvHideMethod: true,
        nodeType: "form",
      },
    ],
    eventTriggerDescription: "Waiting for you to submit the form",
    activationMessage: "You can now make calls to your production Form URL.",
    triggerPanel: {
      header: "Pull in a test form submission",
      executionsHelp: {
        inactive:
          "Form Trigger has two modes: test and production. <br /> <br /> <b>Use test mode while you build your workflow</b>. Click the 'Execute step' button, then fill out the test form that opens in a popup tab. The executions will show up in the editor.<br /> <br /> <b>Use production mode to run your workflow automatically</b>. <a data-key=\"activate\">Activate</a> the workflow, then make requests to the production URL. Then every time there's a form submission via the Production Form URL, the workflow will execute. These executions will show up in the executions list, but not in the editor.",
        active:
          "Form Trigger has two modes: test and production. <br /> <br /> <b>Use test mode while you build your workflow</b>. Click the 'Execute step' button, then fill out the test form that opens in a popup tab. The executions will show up in the editor.<br /> <br /> <b>Use production mode to run your workflow automatically</b>. <a data-key=\"activate\">Activate</a> the workflow, then make requests to the production URL. Then every time there's a form submission via the Production Form URL, the workflow will execute. These executions will show up in the executions list, but not in the editor.",
      },
      activationHint: {
        active:
          "This node will also trigger automatically on new form submissions (but those executions won't show up here).",
        inactive:
          '<a data-key="activate">Activate</a> this workflow to have it also run automatically for new form submissions created via the Production URL.',
      },
    },
    credentials: [
      {
        // eslint-disable-next-line n8n-nodes-base/node-class-description-credentials-name-unsuffixed
        name: "httpBasicAuth",
        required: true,
        displayOptions: {
          show: {
            [FORM_TRIGGER_AUTHENTICATION_PROPERTY]: ["basicAuth"],
          },
        },
      },
    ],

    properties: [
      {
        displayName: "Authentication",
        name: FORM_TRIGGER_AUTHENTICATION_PROPERTY,
        type: "options",
        options: [
          {
            name: "Basic Auth",
            value: "basicAuth",
          },
          {
            name: "None",
            value: "none",
          },
        ],
        default: "none",
      },
      webhookPath,
      {
        displayName: "JsonForms JSON Schema",
        name: "jsonSchema",
        type: "json",
        default: JSON.stringify(
          {
            type: "object",
            properties: {
              name: {
                type: "string",
                title: "Name",
                description: "Your full name",
              },
              email: {
                type: "string",
                format: "email",
                title: "Email",
                description: "Your email address",
              },
              message: {
                type: "string",
                title: "Message",
                description: "Your message",
              },
            },
            required: ["name", "email", "message"],
          },
          null,
          2
        ),
        description: "JSON Schema that defines the form structure",
      },
      {
        displayName: "JsonForms UI Schema",
        name: "uiSchema",
        type: "json",
        default: JSON.stringify(
          {
            type: "VerticalLayout",
            elements: [
              {
                type: "Control",
                scope: "#/properties/name",
              },
              {
                type: "Control",
                scope: "#/properties/email",
              },
              {
                type: "Control",
                scope: "#/properties/message",
                options: {
                  multi: true,
                },
              },
              {
                type: "Button",
                label: "Submit",
                action: "submit",
              },
            ],
          },
          null,
          2
        ),
        description: "UI Schema that defines how the form should be rendered",
      },
      {
        displayName: "JsonForms Data",
        name: "data",
        type: "json",
        default: JSON.stringify({}, null, 2),
        description: "Data that defines the initial state for the form",
      },
      {
        displayName: "JsonForms Config",
        name: "config",
        type: "json",
        default: JSON.stringify(
          {
            restrict: true,
            trim: false,
            showUnfocusedDescription: false,
            hideRequiredAsterisk: true,
            enableFilterErrorsBeforeTouch: false,
            allowAdditionalPropertiesIfMissing: false,
          },
          null,
          2
        ),
        description: "Data that defines the initial data for the form",
      },
      formRespondMode,
      {
        displayName: "Options",
        name: "options",
        type: "collection",
        placeholder: "Add option",
        default: {},
        options: [
          {
            displayName: "Custom Form Styling",
            name: "customCss",
            type: "string",
            typeOptions: {
              rows: 10,
              editor: "cssEditor",
            },
            default: `
:host { 
  .v-application__wrap {
    min-height: 0px;
  }
}`,
            description:
              "Override default styling of the public form interface with CSS",
          },
          {
            displayName: "Ignore Bots",
            name: "ignoreBots",
            type: "boolean",
            default: false,
            description:
              "Whether to ignore requests from bots like link previewers and web crawlers",
          },
          {
            displayName: "Read Only",
            name: "readonly",
            type: "boolean",
            default: false,
            description: "Whether to show the form in readonly mode",
          },
          {
            ...useWorkflowTimezone,
            default: true,
            description:
              "Whether to use the workflow timezone in 'submittedAt' field or UTC",
          },
          {
            displayName: "Validation Mode",
            name: "validationMode",
            type: "options",
            options: [
              {
                name: "Validate And Show",
                value: "ValidateAndShow",
              },
              {
                name: "Validate And Hide",
                value: "ValidateAndHide",
              },
              {
                name: "No Validation",
                value: "NoValidation",
              },
            ],
            default: "ValidateAndShow",
            description:
              "Determines how validation errors are handled and displayed",
          },
          {
            ...respondWithOptions,
          },
          {
            displayName: "Vuetify Options",
            name: "vuetifyOptions",
            type: "json",
            default: JSON.stringify(
              {
                blueprint: "md1",
                theme: { dark: true },
              },
              null,
              2
            ),
            description: "Override default Vuetify options",
          },
        ],
      },
    ],
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const context = this;

    const options = context.getNodeParameter("options", {}) as {
      ignoreBots?: boolean;
      respondWithOptions?: {
        values: {
          respondWith: "text" | "redirect";
          formSubmittedText: string;
          redirectUrl: string;
        };
      };
      formSubmittedText?: string;
      useWorkflowTimezone?: boolean;
      customCss?: string;
      vuetifyOptions?: string;
      readonly?: boolean;
      validationMode?: "ValidateAndShow" | "ValidateAndHide" | "NoValidation";
    };

    const req = context.getRequestObject();
    const res = context.getResponseObject();

    try {
      if (options.ignoreBots && isbot(req.headers["user-agent"])) {
        // eslint-disable-next-line n8n-nodes-base/node-execute-block-wrong-error-thrown
        throw new WebhookAuthorizationError(403);
      }
      await validateWebhookAuthentication(
        context,
        FORM_TRIGGER_AUTHENTICATION_PROPERTY
      );
    } catch (error) {
      if (error instanceof WebhookAuthorizationError) {
        res.setHeader("WWW-Authenticate", 'Basic realm="Enter credentials"');
        res.status(401).send();
        return { noWebhookResponse: true };
      }
      throw error;
    }

    validateResponseModeConfiguration(context);

    if (req.method === "GET") {
      const html = VuetifyJsonFormsTrigger.generateFormHtml(this);

      res.status(200).send(html);
      return { noWebhookResponse: true };
    } else if (req.method === "POST") {
      // Process form submission

      const formData = JSON.parse(req.body) as
        | IDataObject
        | GenericValue
        | GenericValue[]
        | IDataObject[];
      const schema = context.getNodeParameter("jsonSchema") as string;

      const validate = ajv.compile(JSON.parse(schema));

      const valid = validate(formData);
      if (!valid) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Data validation failed",
            errors: validate.errors,
          })
        );
        return { noWebhookResponse: true };
      }
      //const responseMode = context.getNodeParameter("responseMode") as string;

      let { useWorkflowTimezone } = options;
      if (useWorkflowTimezone === undefined) {
        useWorkflowTimezone = true;
      }

      const timezone = useWorkflowTimezone ? context.getTimezone() : "UTC";
      const submittedAt = DateTime.now().setZone(timezone).toISO();
      const mode = context.getMode() === "manual" ? "test" : "production";

      // Return the form data for processing in the workflow
      const returnData: INodeExecutionData[] = [
        {
          json: {
            formData,
            submittedAt: submittedAt,
            formMode: mode,
            ...(Object.keys(req.query || {}).length > 0 && {
              formQueryParameters: req.query,
            }),
          },
        },
      ];

      return {
        webhookResponse: { status: 200 },
        workflowData: [returnData],
      };
    }

    res.status(405).send("Method not allowed");
    return { noWebhookResponse: true };
  }

  static generateFormHtml(context: IWebhookFunctions): string {
    const schema = context.getNodeParameter("jsonSchema") as string;
    const uischema = context.getNodeParameter("uiSchema") as string;
    const data = context.getNodeParameter("data") as string;
    const config = context.getNodeParameter("config") as string;
    const webhookUrl = context.getNodeWebhookUrl("default");

    const options = context.getNodeParameter("options", {}) as {
      ignoreBots?: boolean;
      respondWithOptions?: {
        values: {
          respondWith: "text" | "redirect";
          formSubmittedText: string;
          redirectUrl: string;
        };
      };
      formSubmittedText?: string;
      useWorkflowTimezone?: boolean;
      customCss?: string;
      vuetifyOptions?: string;
      readonly?: boolean;
      validationMode?: "ValidateAndShow" | "ValidateAndHide" | "NoValidation";
    };

    return `
<!DOCTYPE html>
<html>
  <body>
    <vuetify-json-forms id="vuetify-json-forms"></vuetify-json-forms>

    <script type="text/javascript">

      const onChange = (customEvent) => {
        let [event] = customEvent.detail;

        if (event.errors && event.errors.length > 0) {
          // just dump the errors in the JS console if there are errors
          console.log("Form state errors:", JSON.stringify(event.errors));
        }
      };

      const submit = async (event) => {
        const data = event.context.data;

        if (event.context.errors && event.context.errors.length > 0) {
          alert('Fix Errors');
        } else {
          try {
            event.context.readonly = true;

   					let postUrl = '${webhookUrl}';
            if (!window.location.href.includes('form-waiting')) {
              postUrl = window.location.search;
            }

            await fetch(postUrl, { method: 'POST', body: JSON.stringify(data) });
          } finally {
            event.context.readonly = false;
          }
        }
      };

      const onHandleAction = (customEvent) => {
        let [event] = customEvent.detail;
        if (event.action === 'submit') {
          event.callback = submit;
        }
      };

      var form = document.getElementById("vuetify-json-forms");
      ${data !== undefined && data !== null ? `form.setAttribute("data",` + JSON.stringify(data).replace(/\//g, "\\/") + `);` : ""}
      ${schema !== undefined && schema !== null ? `form.setAttribute("schema",` + JSON.stringify(schema).replace(/\//g, "\\/") + `);` : ""}
      ${uischema !== undefined && uischema !== null ? `form.setAttribute("uischema",` + JSON.stringify(uischema).replace(/\//g, "\\/") + `);` : ""}
      ${config !== undefined && config !== null ? `form.setAttribute("config",` + JSON.stringify(config).replace(/\//g, "\\/") + `);` : ""}
      
      ${options.vuetifyOptions ? `form.setAttribute('vuetify-options', ` + JSON.stringify(options.vuetifyOptions).replace(/\//g, "\\/") + `);` : ""}
      ${options.customCss ? `form.setAttribute('custom-style', ` + JSON.stringify(options.customCss).replace(/\//g, "\\/") + `);` : ""}
      ${options.validationMode ? `form.setAttribute('validation-mode', ` + JSON.stringify(options.validationMode).replace(/\//g, "\\/") + `);` : ""}
      ${typeof options.readonly === "boolean" && options.readonly ? `form.setAttribute('readonly', '');` : ""}

      form.addEventListener("change", onChange);
      form.addEventListener("handle-action", onHandleAction);
    </script>

    <script
      type="module"
      src="https://cdn.jsdelivr.net/npm/@chobantonov/jsonforms-vuetify-webcomponent@3.6.0/dist/vuetify-json-forms.min.js"
    ></script>
  </body>
</html>`;
  }
}
