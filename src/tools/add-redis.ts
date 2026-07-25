// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { readFileSync, writeFileSync } from "node:fs"
import { parseEndpoint, injectConnector, error, status, defineTool, endpointArg } from "../lib.ts"
import { ensurePythonRequirement } from "./requirements.ts"

const LEGACY_CLIENT = 'redis.from_url(args.get("REDIS_URL", os.getenv("REDIS_URL")))'
const TEXT_CLIENT = 'redis.from_url(args.get("REDIS_URL", os.getenv("REDIS_URL")), decode_responses=True)'

export default defineTool({
  name: "action_add_redis",
  config: {
    description: "Add Redis to one endpoint as ctx.REDIS and ctx.REDIS_PREFIX. For authenticated pages, every login/registration, me/session, protected-resource, and logout endpoint must be wired; use auth_setup to configure the complete set atomically. Authentication uses opaque random tokens stored server-side in prefix-safe Redis keys with a bounded TTL, never JWT or an application signing secret.",
    inputSchema: { endpoint: endpointArg },
  },
  handler({ endpoint }) {
    let ep
    try {
      ep = parseEndpoint(endpoint)
    } catch (e) {
      return error(`Error: ${(e as Error).message}`)
    }
    const injection = `
#--param REDIS_URL "$REDIS_URL"
#--param REDIS_PREFIX "$REDIS_PREFIX"
import redis
def init_redis(args, ctx):
  ctx.REDIS = redis.from_url(args.get("REDIS_URL", os.getenv("REDIS_URL")), decode_responses=True)
  ctx.REDIS_PREFIX = args.get("REDIS_PREFIX", os.getenv("REDIS_PREFIX"))
builder.append(init_redis)`

    const connector = injectConnector({
      endpoint: ep,
      label: "Redis",
      guard: "init_redis",
      injection,
      available: "  ctx.REDIS — the Redis client\n  ctx.REDIS_PREFIX — the key prefix",
    })
    if (connector.startsWith("Error:")) return status(connector)

    const wrapper = readFileSync(ep.mainPath, "utf-8")
    if (wrapper.includes(LEGACY_CLIENT)) {
      writeFileSync(ep.mainPath, wrapper.replace(LEGACY_CLIENT, TEXT_CLIENT))
    }

    const requirement = ensurePythonRequirement(ep.dir, "redis")
    if (requirement.startsWith("Error:")) return status(requirement)
    // WHY: tool metadata is not always retained after discovery. Repeat the
    // authentication invariant in the result so a successful connector call
    // cannot be mistaken for a complete one-endpoint auth setup.
    return status(`${connector}
${requirement}
Authentication contract: use auth_setup for the complete endpoint set. Store a cryptographically random opaque token as a prefix-safe ctx.REDIS_PREFIX session key with a bounded TTL; protected endpoints derive identity from that server-side record and logout deletes it. Do not use JWT or an application signing secret.`)
  },
})
