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
import { bindSecret, ensureEnvSecret, hasEnvSecret, normalizeSecretName } from "../secrets.ts"

export default defineTool({
  name: "auth_setup",
  config: {
    description: "Prepare one shared secret for token-issuing and protected endpoints. Optionally generates a missing secret without exposing it, then binds every endpoint atomically.",
    inputSchema: {
      secret: z.string().describe("The exact application secret name (e.g. JWT_SECRET)"),
      token_endpoints: z.array(endpointArg).min(1).describe("Endpoints that create or refresh authentication tokens, such as register and login"),
      protected_endpoints: z.array(endpointArg).min(1).describe("Endpoints that validate authentication, including me/session and protected resources"),
      generate_if_missing: z.boolean().optional().describe("Generate the secret in .env when absent. Defaults to false."),
    },
  },
  handler({ secret, token_endpoints, protected_endpoints, generate_if_missing }) {
    try {
      const name = normalizeSecretName(secret)
      let created = false
      if (!hasEnvSecret(name)) {
        if (!generate_if_missing) {
          return error(`Authentication setup failed: secret '${name}' is not configured in .env. Call secret_ensure after the exact name is authorized, then retry auth_setup. No endpoint was changed.`)
        }
        created = ensureEnvSecret(name).created
      }

      const endpoints = [...new Set([...token_endpoints, ...protected_endpoints])]
      const result = bindSecret(name, endpoints)
      const lines = [
        `Authentication secret '${name}' is ready for all ${endpoints.length} endpoints.`,
        created ? "A new value was generated in .env and was not returned." : "The existing value was not read or returned.",
      ]
      if (result.configured.length > 0) lines.push(`Configured: ${result.configured.join(", ")}.`)
      if (result.alreadyConfigured.length > 0) lines.push(`Already configured: ${result.alreadyConfigured.join(", ")}.`)
      lines.push(`All token creation and validation code must use ctx.${name}; never os.getenv with a default or a hardcoded fallback.`)
      lines.push("Registration must establish the same authenticated state as login. The frontend must validate persisted tokens through a protected me/session endpoint before rendering private pages.")
      return text(lines.join("\n"))
    } catch (cause) {
      return error(`Authentication setup failed: ${(cause as Error).message}`)
    }
  },
})
