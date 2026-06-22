import { parseEndpoint, injectConnector, text, defineTool, endpointArg } from "../lib.ts"

export default defineTool({
  name: "action_add_milvus",
  config: {
    description: "Add Milvus vector DB connection to an endpoint's context. Provides ctx.MILVUS.",
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
#--param MILVUS_HOST "$MILVUS_HOST"
#--param MILVUS_PORT "$MILVUS_PORT"
#--param MILVUS_DB_NAME "$MILVUS_DB_NAME"
#--param MILVUS_TOKEN "$MILVUS_TOKEN"
from pymilvus import MilvusClient
def init_milvus(args, ctx):
  host = args.get('MILVUS_HOST', os.getenv('MILVUS_HOST'))
  port = args.get('MILVUS_PORT', os.getenv('MILVUS_PORT'))
  uri = f"http://{host}:{port}"
  token = args.get("MILVUS_TOKEN", os.getenv("MILVUS_TOKEN"))
  db_name = args.get("MILVUS_DB_NAME", os.getenv("MILVUS_DB_NAME"))
  ctx.MILVUS = MilvusClient(uri=uri, token=token, db_name=db_name)
builder.append(init_milvus)`

    return text(
      injectConnector({
        endpoint: ep,
        label: "Milvus",
        guard: "init_milvus",
        injection,
        available: "  ctx.MILVUS — the MilvusClient instance",
      }),
    )
  },
})
