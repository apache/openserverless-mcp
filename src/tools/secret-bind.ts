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

import { z } from "zod"
import { defineTool, endpointArg, error, text } from "../lib.ts"
import { bindSecret, normalizeSecretName } from "../secrets.ts"

export default defineTool({
  name: "secret_bind",
  config: {
    description: "Atomically bind one existing .env secret to multiple OpenServerless endpoints as ctx.<SECRET>.",
    inputSchema: {
      secret: z.string().describe("The secret name (e.g. JWT_SECRET)"),
      endpoints: z.array(endpointArg).min(1).describe("Every endpoint that must receive the same secret"),
    },
  },
  handler({ secret, endpoints }) {
    try {
      const name = normalizeSecretName(secret)
      const result = bindSecret(name, endpoints)
      const lines = [`Secret '${name}' binding completed without exposing its value.`]
      if (result.configured.length > 0) lines.push(`Configured: ${result.configured.join(", ")}.`)
      if (result.alreadyConfigured.length > 0) lines.push(`Already configured: ${result.alreadyConfigured.join(", ")}.`)
      lines.push(`Use ctx.${name} in action code and fail closed if it is unavailable; never use a hardcoded fallback.`)
      return text(lines.join("\n"))
    } catch (cause) {
      return error(`Secret binding failed: ${(cause as Error).message}`)
    }
  },
})
