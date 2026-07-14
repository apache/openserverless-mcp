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

import { parseEndpoint, injectConnector, error, status, defineTool, endpointArg } from "../lib.ts"

export default defineTool({
  name: "action_add_mongodb",
  config: {
    description: "Add MongoDB connection to an endpoint's context. Provides ctx.MONGODB_CLIENT and ctx.MONGODB.",
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
#--param MONGODB_URI "$MONGODB_URI"
from pymongo import MongoClient
def init_mongodb(args, ctx):
  uri = args.get("MONGODB_URI", os.getenv("MONGODB_URI"))
  if not uri:
    raise RuntimeError("MONGODB_URI is not configured for this action")
  ctx.MONGODB_CLIENT = MongoClient(uri)
  ctx.MONGODB = ctx.MONGODB_CLIENT.get_default_database()
builder.append(init_mongodb)`

    return status(
      injectConnector({
        endpoint: ep,
        label: "MongoDB",
        guard: "init_mongodb",
        injection,
        available: "  ctx.MONGODB_CLIENT — the MongoClient instance\n  ctx.MONGODB — the default MongoDB database",
      }),
    )
  },
})
