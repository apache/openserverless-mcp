#!/usr/bin/env -S npx tsx
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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { Tool } from "./lib.ts"

import actionNew from "./tools/new.ts"
import actionInvoke from "./tools/invoke.ts"
import actionRequirements from "./tools/requirements.ts"
import actionAddSecret from "./tools/add-secret.ts"
import actionAddS3 from "./tools/add-s3.ts"
import actionAddPostgresql from "./tools/add-postgresql.ts"
import actionAddRedis from "./tools/add-redis.ts"
import actionAddMilvus from "./tools/add-milvus.ts"

const tools: Tool[] = [
  actionNew,
  actionInvoke,
  actionRequirements,
  actionAddSecret,
  actionAddS3,
  actionAddPostgresql,
  actionAddRedis,
  actionAddMilvus,
]

const server = new McpServer({
  name: "openserverless-mcp",
  version: "0.1.0",
})

for (const t of tools) {
  server.registerTool(t.name, t.config, t.handler)
}

const transport = new StdioServerTransport()
await server.connect(transport)
