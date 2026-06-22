import { parseEndpoint, injectConnector, text, defineTool, endpointArg } from "../lib.ts"

export default defineTool({
  name: "action_add_s3",
  config: {
    description: "Add S3 connection to an endpoint's context. Provides ctx.S3_CLIENT, ctx.S3_DATA, ctx.S3_WEB, ctx.S3_PUBLIC.",
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
#--param S3_HOST "$S3_HOST"
#--param S3_PORT "$S3_PORT"
#--param S3_ACCESS_KEY "$S3_ACCESS_KEY"
#--param S3_SECRET_KEY "$S3_SECRET_KEY"
#--param S3_BUCKET_DATA "$S3_BUCKET_DATA"
#--param S3_BUCKET_STATIC "$S3_BUCKET_STATIC"
#--param S3_PUBLIC "$OPSDEV_S3"
import boto3
from botocore.client import Config
def init_s3(args, ctx):
  host = args.get("S3_HOST", os.getenv("S3_HOST"))
  port = args.get("S3_PORT", os.getenv("S3_PORT"))
  url = f"http://{host}:{port}"
  key = args.get("S3_ACCESS_KEY", os.getenv("S3_ACCESS_KEY"))
  sec = args.get("S3_SECRET_KEY", os.getenv("S3_SECRET_KEY"))
  cfg = Config(signature_version='s3v4')
  ctx.S3_CLIENT = boto3.client('s3', region_name='us-east-1', endpoint_url=url, aws_access_key_id=key, aws_secret_access_key=sec, config=cfg)
  ctx.S3_DATA = args.get("S3_BUCKET_DATA", os.getenv("S3_BUCKET_DATA"))
  ctx.S3_WEB = args.get("S3_BUCKET_STATIC", os.getenv("S3_BUCKET_STATIC"))
  ctx.S3_PUBLIC = args.get("S3_PUBLIC", os.getenv("OPSDEV_S3"))
builder.append(init_s3)`

    return text(
      injectConnector({
        endpoint: ep,
        label: "S3",
        guard: "init_s3",
        injection,
        available:
          "  ctx.S3_CLIENT — the S3 client\n  ctx.S3_DATA — the S3 data bucket (private)\n  ctx.S3_WEB — the S3 web bucket (public)\n  ctx.S3_PUBLIC — the public URL to access S3",
      }),
    )
  },
})
