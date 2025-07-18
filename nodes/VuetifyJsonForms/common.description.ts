import type { INodeProperties } from "n8n-workflow";

export const webhookPath: INodeProperties = {
  displayName: "Form Path",
  name: "path",
  type: "string",
  default: "",
  placeholder: "webhook",
  required: true,
  description:
    "The final segment of the form's URL, both for test and production",
};

export const formRespondMode: INodeProperties = {
  displayName: "Respond When",
  name: "responseMode",
  type: "options",
  options: [
    {
      name: "Form Is Submitted",
      value: "onReceived",
      description: "As soon as this node receives the form submission",
    },
    {
      name: "Workflow Finishes",
      value: "lastNode",
      description: "When the last node of the workflow is executed",
    },
    {
      name: "Using 'Respond to Webhook' Node",
      value: "responseNode",
      description: "When the 'Respond to Webhook' node is executed",
    },
  ],
  default: "onReceived",
  description: "When to respond to the form submission",
};

export const formTriggerPanel = {
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
};

export const respondWithOptions: INodeProperties = {
  displayName: "Form Response",
  name: "respondWithOptions",
  type: "fixedCollection",
  placeholder: "Add option",
  default: { values: { respondWith: "text" } },
  options: [
    {
      displayName: "Values",
      name: "values",
      values: [
        {
          displayName: "Respond With",
          name: "respondWith",
          type: "options",
          default: "text",
          options: [
            {
              name: "Form Submitted Text",
              value: "text",
              description: "Show a response text to the user",
            },
            {
              name: "Redirect URL",
              value: "redirect",
              description: "Redirect the user to a URL",
            },
          ],
        },
        {
          displayName: "Text to Show",
          name: "formSubmittedText",
          description:
            "The text displayed to users after they fill the form. Leave it empty if don't want to show any additional text.",
          type: "string",
          default: "Your response has been recorded",
          displayOptions: {
            show: {
              respondWith: ["text"],
            },
          },
        },
        {
          // eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
          displayName: "URL to Redirect to",
          name: "redirectUrl",
          description:
            "The URL to redirect users to after they fill the form. Must be a valid URL.",
          type: "string",
          default: "",
          validateType: "url",
          placeholder: "e.g. http://www.n8n.io",
          displayOptions: {
            show: {
              respondWith: ["redirect"],
            },
          },
        },
      ],
    },
  ],
};
