#!/usr/bin/env -S npx tsx
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
