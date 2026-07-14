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
import { hasEnvSecret, normalizeSecretName, secretBindingStatus } from "../secrets.ts"

export default defineTool({
  name: "secret_status",
  config: {
    description: "Report whether a secret exists and is bound to selected endpoints without reading or returning its value.",
    inputSchema: {
      secret: z.string().describe("The secret name (e.g. JWT_SECRET)"),
      endpoints: z.array(endpointArg).optional().describe("Optional endpoints whose secret binding should be checked"),
    },
  },
  handler({ secret, endpoints }) {
    try {
      const name = normalizeSecretName(secret)
      const present = hasEnvSecret(name)
      const lines = [`Secret '${name}': ${present ? "configured in .env" : "not configured in .env"}.`]
      for (const binding of secretBindingStatus(name, endpoints ?? [])) {
        lines.push(`Endpoint '${binding.endpoint}': ${binding.configured ? "bound" : "not bound"}.`)
      }
      lines.push("No secret value was read or returned.")
      return text(lines.join("\n"))
    } catch (cause) {
      return error(`Secret status failed: ${(cause as Error).message}`)
    }
  },
})
