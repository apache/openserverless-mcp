import { parseEndpoint, injectConnector, text, defineTool, endpointArg } from "../lib.ts"

export default defineTool({
  name: "action_add_postgresql",
  config: {
    description: "Add PostgreSQL connection to an endpoint's context. Provides ctx.POSTGRESQL.",
    inputSchema: { endpoint: endpointArg },
  },
  handler({ endpoint }) {
    let ep
    try {
      ep = parseEndpoint(endpoint)
    } catch (e) {
      return text(`Error: ${(e as Error).message}`)
    }
    const injection = `
#--param POSTGRES_URL "$POSTGRES_URL"
import psycopg
def init_postgresql(args, ctx):
  dburl = args.get("POSTGRES_URL", os.getenv("POSTGRES_URL"))
  ctx.POSTGRESQL = psycopg.connect(dburl)
builder.append(init_postgresql)`

    return text(
      injectConnector({
        endpoint: ep,
        label: "PostgreSQL",
        guard: "init_postgresql",
        injection,
        available: "  ctx.POSTGRESQL — the psycopg connection",
      }),
    )
  },
})
