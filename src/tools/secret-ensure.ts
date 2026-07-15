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
import { defineTool, error, text } from "../lib.ts"
import { ensureEnvSecret, normalizeSecretName } from "../secrets.ts"

export default defineTool({
  name: "secret_ensure",
  config: {
    description: "Create an application secret in .env only when absent. The value is generated securely and is never returned to the MCP client.",
    inputSchema: {
      secret: z.string().describe("The exact secret name authorized for this application (e.g. JWT_SECRET)"),
      bytes: z.number().int().min(32).max(128).optional().describe("Random byte count. Defaults to 48."),
    },
  },
  handler({ secret, bytes }) {
    try {
      const name = normalizeSecretName(secret)
      const result = ensureEnvSecret(name, bytes ?? 48)
      const persistence = result.persisted ? " It was synchronized with the configured persistent secret store." : ""
      return text(result.created
        ? `Created secret '${name}' in .env. Its value was not returned.${persistence}`
        : `Secret '${name}' is already configured in .env. Its value was not returned.${persistence}`)
    } catch (cause) {
      return error(`Secret setup failed: ${(cause as Error).message}`)
    }
  },
})
