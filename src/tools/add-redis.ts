import { parseEndpoint, injectConnector, text, defineTool, endpointArg } from "../lib.ts"

export default defineTool({
  name: "action_add_redis",
  config: {
    description: "Add Redis connection to an endpoint's context. Provides ctx.REDIS and ctx.REDIS_PREFIX.",
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
#--param REDIS_URL "$REDIS_URL"
#--param REDIS_PREFIX "$REDIS_PREFIX"
import redis
def init_redis(args, ctx):
  ctx.REDIS = redis.from_url(args.get("REDIS_URL", os.getenv("REDIS_URL")))
  ctx.REDIS_PREFIX = args.get("REDIS_PREFIX", os.getenv("REDIS_PREFIX"))
builder.append(init_redis)`

    return text(
      injectConnector({
        endpoint: ep,
        label: "Redis",
        guard: "init_redis",
        injection,
        available: "  ctx.REDIS — the Redis client\n  ctx.REDIS_PREFIX — the key prefix",
      }),
    )
  },
})
