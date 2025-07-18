import isbot from "isbot";
import { DateTime } from "luxon";
import {
  FORM_NODE_TYPE,
  IDataObject,
  INodeExecutionData,
  INodeProperties,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  NodeConnectionType,
  NodeTypeAndVersion,
  WAIT_NODE_TYPE,
} from "n8n-workflow";

import Ajv from "ajv";
import addFormats from "ajv-formats";
import keywords from "ajv-keywords";
import {
  formRespondMode,
  respondWithOptions,
  webhookPath,
} from "./common.description";
import { WebhookAuthorizationError } from "./error";
import { FORM_TRIGGER_AUTHENTICATION_PROPERTY } from "./interfaces";
import {
  sanitizeCustomCss,
  validateResponseModeConfiguration,
  validateWebhookAuthentication,
} from "./utils";

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
    icon: { light: "file:jsonforms.svg", dark: "file:jsonforms.svg" },
    group: ["trigger"],
    version: 1,
    description:
      "Generate webforms in n8n and pass their responses to the workflow",
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
      {
        displayName: "JsonForms JSON Schema",
        name: "jsonSchema",
        type: "json",
        default: JSON.stringify(
          {
            $schema: "http://json-schema.org/draft-07/schema#",
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
            additionalProperties: false,
          },
          null,
          2,
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
                action: "n8n:submit",
                color: "primary",
                params: {
                  action: "submit",
                },
                rule: {
                  effect: "ENABLE",
                  condition: {
                    scope: "#/",
                    schema: { $ref: "/#" },
                  },
                },
              },
            ],
          },
          null,
          2,
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
          2,
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
            default: `:root {
              /* Fonts */
              --font-family: "Open Sans", sans-serif;
              --font-size-body: 12px;

              /* Colors */
              --color-background: #fbfcfe;
              --color-card-bg: #ffffff;
              --color-card-border: #dbdfe7;
              --color-card-shadow: rgba(99, 77, 255, 0.06);
              --color-input-border: #dbdfe7;

              /* Border Radii */
              --border-radius-card: 8px;

              /* Spacing */
       				--padding-container-top: 24px;
              --padding-card: 24px;
              --margin-bottom-card: 16px;

              /* Dimensions */
              --container-width: 448px;

              /* Others */
              --box-shadow-card: 0px 4px 16px 0px var(--color-card-shadow);
      			}`,
            description:
              "Override default styling of the public form interface with CSS",
          },
          {
            displayName: "Custom JSON Form Styling",
            name: "customStyle",
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
            displayName: "Event JSON Schema",
            name: "eventJsonSchema",
            type: "json",
            default: JSON.stringify(
              {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                  },
                },
                additionalProperties: false,
              },
              null,
              2,
            ),
            description: "Event JSON schema that validates all Button params",
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
            ...webhookPath,
            required: false,
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
              2,
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
      eventJsonSchema?: string;
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
        FORM_TRIGGER_AUTHENTICATION_PROPERTY,
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

      const request = JSON.parse(req.body);

      const schema = context.getNodeParameter("jsonSchema") as string;

      const validateData = ajv.compile(JSON.parse(schema));

      if (!validateData(request.data)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Data validation failed",
            errors: validateData.errors,
          }),
        );
        return { noWebhookResponse: true };
      }

      if (options.eventJsonSchema) {
        const validateEvent = ajv.compile(JSON.parse(options.eventJsonSchema));
        if (!validateEvent(request.event)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              message: "Event validation failed",
              errors: validateEvent.errors,
            }),
          );
          return { noWebhookResponse: true };
        }
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
            data: request.data,
            event: request.event,
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

  static isFormConnected = (nodes: NodeTypeAndVersion[]) => {
    return nodes.some(
      (n) =>
        n.type === FORM_NODE_TYPE ||
        (n.type === WAIT_NODE_TYPE && n.parameters?.resume === "form"),
    );
  };

  static generateFormHtml(context: IWebhookFunctions): string {
    const schema = context.getNodeParameter("jsonSchema") as string;
    const uischema = context.getNodeParameter("uiSchema") as string;
    const data = context.getNodeParameter("data") as string;
    const config = context.getNodeParameter("config") as string;
    //const webhookUrl = context.getNodeWebhookUrl("default");
    let responseMode = context.getNodeParameter("responseMode", "") as string;

    let formSubmittedText;
    let redirectUrl;

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
      customStyle?: string;
      vuetifyOptions?: string;
      readonly?: boolean;
      validationMode?: "ValidateAndShow" | "ValidateAndHide" | "NoValidation";
      eventJsonSchema?: string;
    };

    if (options.respondWithOptions) {
      const values = (options.respondWithOptions as IDataObject)
        .values as IDataObject;
      if (values.respondWith === "text") {
        formSubmittedText = values.formSubmittedText as string;
      }
      if (values.respondWith === "redirect") {
        redirectUrl = values.redirectUrl as string;
      }
    } else {
      formSubmittedText = options.formSubmittedText as string;
    }

    const connectedNodes = context.getChildNodes(context.getNode().name, {
      includeNodeParameters: true,
    });
    const hasNextPage = VuetifyJsonFormsTrigger.isFormConnected(connectedNodes);

    if (hasNextPage) {
      redirectUrl = undefined;
      responseMode = "responseNode";
    }

    if (formSubmittedText === undefined) {
      formSubmittedText = "Your response has been recorded";
    }

    const useResponseData = responseMode === "responseNode";

    const dangerousCustomCss = sanitizeCustomCss(options.customCss);
    return `
<!DOCTYPE html>
<html>
	<head>
		<meta charset='UTF-8' />
		<meta name='viewport' content='width=device-width, initial-scale=1.0' />
		<link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet">

    <style>
    :root {
				/* Fonts */
				--font-family: "Open Sans", sans-serif;
				--font-size-body: 12px;

				/* Colors */
				--color-background: #fbfcfe;
				--color-card-bg: #ffffff;
				--color-card-border: #dbdfe7;
				--color-card-shadow: rgba(99, 77, 255, 0.06);
				--color-input-border: #dbdfe7;

				/* Border Radii */
				--border-radius-card: 8px;

				/* Spacing */
				--padding-container-top: 24px;
				--padding-card: 24px;
				--margin-bottom-card: 16px;

 				/* Dimensions */
				--container-width: 448px;

				/* Others */
				--box-shadow-card: 0px 4px 16px 0px var(--color-card-shadow);
			}

 			*,
			::after,
			::before {
				box-sizing: border-box;
				margin: 0;
				padding: 0;
			}

      body {
				font-family: var(--font-family);
				font-weight: 400;
				font-size: var(--font-size-body);
				display: flex;
				flex-direction: column;
				justify-content: start;
				background-color: var(--color-background);
			}

      .container {
				margin: auto;
				text-align: center;
				padding-top: var(--padding-container-top);
				width: var(--container-width);
			}


 			.card {
				padding: var(--padding-card);
				background-color: var(--color-card-bg);
				border: 1px solid var(--color-card-border);
				border-radius: var(--border-radius-card);
				box-shadow: var(--box-shadow-card);
				margin-bottom: var(--margin-bottom-card);
			}

      @media only screen and (max-width: 500px) {
				body {
					background-color: var(--color-background);
				}
        .container {
					width: 95%;
					min-height: 100vh;
					padding: 24px;
					border: 0px solid var(--color-input-border);
					border-radius: 0px;
					box-shadow: 0px 0px 0px 0px #ffffff;
				}
				.card {
					padding: 0px;
					background-color: var(--color-card-bg);
					border: 0px solid var(--color-input-border);
					border-radius: 0px;
					box-shadow: 0px 0px 0px 0px #ffffff;
					margin-bottom: 0px;
				}
			}

    </style>

    ${dangerousCustomCss ? `<style>${dangerousCustomCss}</style>` : ""}
  </head>
  <body>
		<div class='container'>
      <div class='card' id='n8n-form'>
        <vuetify-json-forms id="vuetify-json-forms"></vuetify-json-forms>
      </div>

      <div class='card' id='submitted-form' style='display: none;'>
        <div class='form-header'>
          <h1 id='submitted-header'>Form Submitted</h1>
          ${
            formSubmittedText
              ? `<p id='submitted-content'>
              ${formSubmittedText}
            </p>`
              : ``
          }
        </div>
      </div>
      ${redirectUrl ? `<a id='redirectUrl' href='${redirectUrl}' style='display: none;'></a>` : ""}
      <input id="useResponseData" style="display: none;" value=${useResponseData} />
    </div>

    <script type="text/javascript">

			const n8nForm = document.querySelector('#n8n-form');

    	let interval = 1000;
			let timeoutId;
			let formWaitingUrl;

			const checkExecutionStatus = async () => {
				if (!interval) return;

				try {
					const response = await fetch(\`\${formWaitingUrl ?? window.location.href}/n8n-execution-status\`);
					const text = (await response.text()).trim();

					if (text === "form-waiting") {
						window.location.replace(formWaitingUrl ?? window.location.href);
						return;
					}

					if (text === "success") {
						n8nForm.style.display = 'none';
						document.querySelector('#submitted-form').style.display = 'block';
						clearTimeout(timeoutId);
						return;
					}

					if (text === "null") {
						n8nForm.style.display = 'none';
						document.querySelector('#submitted-form').style.display = 'block';
						document.querySelector('#submitted-header').textContent = 'Could not get execution status';
						document.querySelector('#submitted-content').textContent =
							'Make sure "Save successful production executions" is enabled in your workflow settings';
						clearTimeout(timeoutId);
						return;
					}

					if(["canceled", "crashed", "error" ].includes(text)) {
						n8nForm.style.display = 'none';
						document.querySelector('#submitted-form').style.display = 'block';
						document.querySelector('#submitted-header').textContent = 'Problem submitting response';
						document.querySelector('#submitted-content').textContent =
							'Please try again or contact support if the problem persists';
						clearTimeout(timeoutId);
						return;
					}

					interval = Math.round(interval * 1.1);
					timeoutId = setTimeout(checkExecutionStatus, interval);
				} catch (error) {
					console.error("Error fetching data:", error);
				}
			};


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

            let postUrl = '';
            if (!window.location.href.includes('form-waiting')) {
              postUrl = window.location.search;
            }

            const response = await fetch(postUrl, { method: 'POST', body: JSON.stringify( { data: data, event: event.params } ) });
            const useResponseData = document.getElementById("useResponseData").value;

            if (useResponseData === "true") {
              const text = await response.text();
              let json;

              try{
                json = JSON.parse(text);
              } catch (e) {}

              if(json?.formWaitingUrl) {
                formWaitingUrl = json.formWaitingUrl;
                clearTimeout(timeoutId);
                timeoutId = setTimeout(checkExecutionStatus, interval);
                return;
              }

              if (json?.redirectURL) {
                const url = json.redirectURL.includes("://") ? json.redirectURL : "https://" + json.redirectURL;
                window.location.replace(url);
                return;
              }

              if (json?.formSubmittedText) {
                n8nForm.style.display = 'none';
                document.querySelector('#submitted-form').style.display = 'block';
                document.querySelector('#submitted-content').textContent = json.formSubmittedText;
                return;
              }

              if (text) {
                document.body.innerHTML = text;
                return;
              }

              if (text === '') {
                // this is empty cleanup response from responsePromise
                // no need to keep checking execution status
                clearTimeout(timeoutId);
                interval = 0;
              }
            }

            if (response.status === 200) {
              if(response.redirected) {
                window.location.replace(response.url);
                return;
              }
              const redirectUrl = document.getElementById("redirectUrl");
              if (redirectUrl) {
                window.location.replace(redirectUrl.href);
              } else {
                n8nForm.style.display = 'none';
                document.querySelector('#submitted-form').style.display = 'block';
              }
            } else {
              n8nForm.style.display = 'none';
              document.querySelector('#submitted-form').style.display = 'block';
              document.querySelector('#submitted-header').textContent = 'Problem submitting response';
              document.querySelector('#submitted-content').textContent =
                'Please try again or contact support if the problem persists';
            }

          } finally {
            event.context.readonly = false;

            if (window.location.href.includes('form-waiting')) {
								clearTimeout(timeoutId);
								timeoutId = setTimeout(checkExecutionStatus, interval);
						}
          }
        }
      };

      const onHandleAction = (customEvent) => {
        let [event] = customEvent.detail;
        if (event.action === 'n8n:submit') {
          event.callback = submit;
        }
      };

      var form = document.getElementById("vuetify-json-forms");
      ${data !== undefined && data !== null ? `form.setAttribute("data",` + JSON.stringify(data).replace(/\//g, "\\/") + `);` : ""}
      ${schema !== undefined && schema !== null ? `form.setAttribute("schema",` + JSON.stringify(schema).replace(/\//g, "\\/") + `);` : ""}
      ${uischema !== undefined && uischema !== null ? `form.setAttribute("uischema",` + JSON.stringify(uischema).replace(/\//g, "\\/") + `);` : ""}
      ${config !== undefined && config !== null ? `form.setAttribute("config",` + JSON.stringify(config).replace(/\//g, "\\/") + `);` : ""}
      
      ${options.vuetifyOptions ? `form.setAttribute('vuetify-options', ` + JSON.stringify(options.vuetifyOptions).replace(/\//g, "\\/") + `);` : ""}
      ${options.customStyle ? `form.setAttribute('custom-style', ` + JSON.stringify(sanitizeCustomCss(options.customStyle)).replace(/\//g, "\\/") + `);` : ""}
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
