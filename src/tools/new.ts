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

import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { parseEndpoint, text, defineTool, endpointArg } from "../lib.ts"

export default defineTool({
  name: "action_new",
  config: {
    description: "Create a new API endpoint. Creates the action folder with __main__.py and module file.",
    inputSchema: {
      endpoint: endpointArg,
      public: z
        .boolean()
        .optional()
        .describe("Whether the action is public (API endpoint). Defaults to true. Set false for private actions (e.g. init package)."),
    },
  },
  handler({ endpoint, public: isPublicArg }) {
    let ep
    try {
      ep = parseEndpoint(endpoint)
    } catch (e) {
      return text(`Error: ${(e as Error).message}`)
    }
    const { pkg, name, dir } = ep

    const validPattern = /^[a-zA-Z][a-zA-Z0-9-]*$/
    if (!validPattern.test(pkg)) {
      return text(`Error: package '${pkg}' must only contain letters, numbers, '-' and start with a letter`)
    }
    if (!validPattern.test(name)) {
      return text(`Error: name '${name}' must only contain letters, numbers, '-' and start with a letter`)
    }

    const isPublic = isPublicArg !== false
    const moduleName = name.replace(/-/g, "_")

    if (existsSync(dir)) {
      return text(`Error: endpoint already exists at ${dir}`)
    }

    mkdirSync(dir, { recursive: true })

    const mainPy = `#--kind python:default
#--web ${isPublic}
# Note: this timeout is 5 minutes - 10 minutes is max allowed
#--timeout 300000
import types, os, ${moduleName}

builder = []
## build-context ##

def main(args):
  try:
    ctx = types.SimpleNamespace()
    for fn in builder: fn(args, ctx)
    return { "body": ${moduleName}.main(args, ctx=ctx) }
  except Exception as e:
    import traceback
    traceback.print_exc()
    return {
      "body": {"error": str(e) },
      "statusCode": 500
    }
`

    const modulePy = `def main(args, ctx=None):
  inp = args.get("input", "${moduleName}")
  out = inp
  return out
`

    writeFileSync(join(dir, "__main__.py"), mainPy)
    writeFileSync(join(dir, `${moduleName}.py`), modulePy)

    return text(`Created endpoint at /api/my/${pkg}/${name}\nFiles:\n  ${dir}/__main__.py\n  ${dir}/${moduleName}.py`)
  },
})
