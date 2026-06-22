import { readFileSync, existsSync } from "node:fs"
import { z } from "zod"
import { parseEndpoint, injectConnector, text, defineTool, endpointArg } from "../lib.ts"

export default defineTool({
  name: "action_add_secret",
  config: {
    description: "Add a secret to an endpoint's context. The secret must exist in .env.",
    inputSchema: {
      endpoint: endpointArg,
      secret: z.string().describe("The secret name (e.g. MY_SECRET)"),
    },
  },
  handler({ endpoint, secret }) {
    let ep
    try {
      ep = parseEndpoint(endpoint)
    } catch (e) {
      return text(`Error: ${(e as Error).message}`)
    }
    const sec = secret.trim()

    let envContent = ""
    if (existsSync(".env")) {
      envContent = readFileSync(".env", "utf-8")
    }
    if (!envContent.includes(`${sec}=`)) {
      return text(`Warning: secret '${sec}' not found in .env. Please add it to your environment before deploying.`)
    }

    const injection = `
#--param ${sec} "$${sec}"
builder.append(lambda args, ctx: setattr(ctx, '${sec}', args.get("${sec}", os.getenv("${sec}"))))`

    return text(
      injectConnector({
        endpoint: ep,
        label: `Secret '${sec}'`,
        guard: `#--param ${sec} `,
        injection,
        available: `  ctx.${sec} — the secret value`,
      }),
    )
  },
})
