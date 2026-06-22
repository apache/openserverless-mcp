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
