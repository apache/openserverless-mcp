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
import { unbindSecret } from "../secrets.ts"

export default defineTool({
  name: "secret_unbind",
  config: {
    description: "Atomically remove one generated secret binding from multiple OpenServerless endpoints without deleting the secret value.",
    inputSchema: {
      secret: z.string().describe("The bound parameter name to remove"),
      endpoints: z.array(endpointArg).min(1).describe("Every endpoint from which the generated binding must be removed"),
    },
  },
  handler({ secret, endpoints }) {
    try {
      const result = unbindSecret(secret, endpoints)
      const lines = [`Binding '${secret.trim()}' removal completed without reading or deleting its value.`]
      if (result.removed.length > 0) lines.push(`Removed from: ${result.removed.join(", ")}.`)
      if (result.alreadyAbsent.length > 0) lines.push(`Already absent from: ${result.alreadyAbsent.join(", ")}.`)
      if (result.removed.length > 0) lines.push("Recreate every changed endpoint with `ops ide undeploy <endpoint>` followed by `ops ide deploy <endpoint>`; an action update alone preserves previously deployed parameters.")
      return text(lines.join("\n"))
    } catch (cause) {
      return error(`Secret unbinding failed: ${(cause as Error).message}`)
    }
  },
})
