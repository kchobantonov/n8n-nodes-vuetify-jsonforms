import basicAuth from "basic-auth";
import jwt from "jsonwebtoken";
import {
  ICredentialDataDecryptedObject,
  IDataObject,
  IWebhookFunctions,
  NodeOperationError,
} from "n8n-workflow";
import { WebhookAuthorizationError } from "./error";

export function formatPrivateKey(
  privateKey: string,
  keyIsPublic = false
): string {
  let regex = /(PRIVATE KEY|CERTIFICATE)/;
  if (keyIsPublic) {
    regex = /(PUBLIC KEY)/;
  }
  if (!privateKey || /\n/.test(privateKey)) {
    return privateKey;
  }
  let formattedPrivateKey = "";
  const parts = privateKey.split("-----").filter((item) => item !== "");
  parts.forEach((part) => {
    if (regex.test(part)) {
      formattedPrivateKey += `-----${part}-----`;
    } else {
      const passRegex = /Proc-Type|DEK-Info/;
      if (passRegex.test(part)) {
        part = part.replace(/:\s+/g, ":");
        formattedPrivateKey += part.replace(/\\n/g, "\n").replace(/\s+/g, "\n");
      } else {
        formattedPrivateKey += part.replace(/\\n/g, "\n").replace(/\s+/g, "\n");
      }
    }
  });
  return formattedPrivateKey;
}

export const validateResponseModeConfiguration = (context: IWebhookFunctions) => {
	const responseMode = context.getNodeParameter('responseMode', 'onReceived') as string;
	const connectedNodes = context.getChildNodes(context.getNode().name);
	const nodeVersion = context.getNode().typeVersion;

	const isRespondToWebhookConnected = connectedNodes.some(
		(node) => node.type === 'n8n-nodes-base.respondToWebhook',
	);

	if (!isRespondToWebhookConnected && responseMode === 'responseNode') {
		throw new NodeOperationError(
			context.getNode(),
			new Error('No Respond to Webhook node found in the workflow'),
			{
				description:
					'Insert a Respond to Webhook node to your workflow to respond to the form submission or choose another option for the “Respond When” parameter',
			},
		);
	}

	if (isRespondToWebhookConnected && responseMode !== 'responseNode' && nodeVersion <= 2.1) {
		throw new NodeOperationError(
			context.getNode(),
			new Error(`${context.getNode().name} node not correctly configured`),
			{
				description:
					'Set the “Respond When” parameter to “Using Respond to Webhook Node” or remove the Respond to Webhook node',
			},
		);
	}

	if (isRespondToWebhookConnected && nodeVersion > 2.1) {
		throw new NodeOperationError(
			context.getNode(),
			new Error(
				'The "Respond to Webhook" node is not supported in workflows initiated by the "n8n Form Trigger"',
			),
			{
				description:
					'To configure your response, add an "n8n Form" node and set the "Page Type" to "Form Ending"',
			},
		);
	}
};


export async function validateWebhookAuthentication(
  ctx: IWebhookFunctions,
  authPropertyName: string
): Promise<void | IDataObject> {
  const authentication = ctx.getNodeParameter(authPropertyName) as string;
  if (authentication === "none") return;

  const req = ctx.getRequestObject();
  const headers = ctx.getHeaderData();

  if (authentication === "basicAuth") {
    // Basic authorization is needed to call webhook
    let expectedAuth: ICredentialDataDecryptedObject | undefined;
    try {
      expectedAuth =
        await ctx.getCredentials<ICredentialDataDecryptedObject>(
          "httpBasicAuth"
        );
    } catch {}

    if (
      expectedAuth === undefined ||
      !expectedAuth.user ||
      !expectedAuth.password
    ) {
      // Data is not defined on node so can not authenticate
      throw new WebhookAuthorizationError(
        500,
        "No authentication data defined on node!"
      );
    }

    const providedAuth = basicAuth(req);
    // Authorization data is missing
    if (!providedAuth) throw new WebhookAuthorizationError(401);

    if (
      providedAuth.name !== expectedAuth.user ||
      providedAuth.pass !== expectedAuth.password
    ) {
      // Provided authentication data is wrong
      throw new WebhookAuthorizationError(403);
    }
  } else if (authentication === "bearerAuth") {
    let expectedAuth: ICredentialDataDecryptedObject | undefined;
    try {
      expectedAuth =
        await ctx.getCredentials<ICredentialDataDecryptedObject>(
          "httpBearerAuth"
        );
    } catch {}

    const expectedToken = expectedAuth?.token as string;
    if (!expectedToken) {
      throw new WebhookAuthorizationError(
        500,
        "No authentication data defined on node!"
      );
    }

    if (headers.authorization !== `Bearer ${expectedToken}`) {
      throw new WebhookAuthorizationError(403);
    }
  } else if (authentication === "headerAuth") {
    // Special header with value is needed to call webhook
    let expectedAuth: ICredentialDataDecryptedObject | undefined;
    try {
      expectedAuth =
        await ctx.getCredentials<ICredentialDataDecryptedObject>(
          "httpHeaderAuth"
        );
    } catch {}

    if (
      expectedAuth === undefined ||
      !expectedAuth.name ||
      !expectedAuth.value
    ) {
      // Data is not defined on node so can not authenticate
      throw new WebhookAuthorizationError(
        500,
        "No authentication data defined on node!"
      );
    }
    const headerName = (expectedAuth.name as string).toLowerCase();
    const expectedValue = expectedAuth.value as string;

    if (
      !headers.hasOwnProperty(headerName) ||
      (headers as IDataObject)[headerName] !== expectedValue
    ) {
      // Provided authentication data is wrong
      throw new WebhookAuthorizationError(403);
    }
  } else if (authentication === "jwtAuth") {
    let expectedAuth;

    try {
      expectedAuth = await ctx.getCredentials<{
        keyType: "passphrase" | "pemKey";
        publicKey: string;
        secret: string;
        algorithm: jwt.Algorithm;
      }>("jwtAuth");
    } catch {}

    if (expectedAuth === undefined) {
      // Data is not defined on node so can not authenticate
      throw new WebhookAuthorizationError(
        500,
        "No authentication data defined on node!"
      );
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      throw new WebhookAuthorizationError(401, "No token provided");
    }

    let secretOrPublicKey;

    if (expectedAuth.keyType === "passphrase") {
      secretOrPublicKey = expectedAuth.secret;
    } else {
      secretOrPublicKey = formatPrivateKey(expectedAuth.publicKey, true);
    }

    try {
      return jwt.verify(token, secretOrPublicKey, {
        algorithms: [expectedAuth.algorithm],
      }) as IDataObject;
    } catch (error) {
      throw new WebhookAuthorizationError(403, error.message);
    }
  }
}
