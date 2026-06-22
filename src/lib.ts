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

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { z, type ZodRawShape } from "zod"

export const BUILD_CONTEXT_MARKER = "## build-context ##"

/** Shared `endpoint` argument used by every action tool. */
export const endpointArg = z
  .string()
  .describe("The endpoint path: 'name' (uses v1 package) or 'package/name'")

/** Shape of a tool result returned to the MCP client. */
export interface ToolResult {
  [x: string]: unknown
  content: { type: "text"; text: string }[]
}

/**
 * A self-contained tool definition. Each file under `tools/` default-exports one
 * of these; `index.ts` registers them all in a loop.
 */
export interface Tool<Args = any> {
  name: string
  config: {
    description: string
    inputSchema: ZodRawShape
  }
  handler: (args: Args) => Promise<ToolResult> | ToolResult
}

/** Helper that preserves the inferred argument type while declaring a Tool. */
export function defineTool<Shape extends ZodRawShape>(t: {
  name: string
  config: { description: string; inputSchema: Shape }
  handler: (args: { [K in keyof Shape]: import("zod").infer<Shape[K]> }) => Promise<ToolResult> | ToolResult
}): Tool {
  return t as Tool
}

/** Result of resolving an endpoint string into a package + action name. */
export interface Endpoint {
  pkg: string
  name: string
  /** packages/<pkg>/<name> */
  dir: string
  /** packages/<pkg>/<name>/__main__.py */
  mainPath: string
}

/**
 * Parse an endpoint path. Accepts "name" (defaults to the v1 package) or
 * "package/name". Throws on malformed input (more than one "/").
 */
export function parseEndpoint(endpoint: string): Endpoint {
  const parts = endpoint.trim().split("/")
  if (parts.length > 2) {
    throw new Error("endpoint must have at most one '/' (format: 'name' or 'package/name')")
  }
  const pkg = parts.length === 1 ? "v1" : parts[0]
  const name = parts.length === 1 ? parts[0] : parts[1]
  const dir = join("packages", pkg, name)
  return { pkg, name, dir, mainPath: join(dir, "__main__.py") }
}

/** A single MCP text tool result. */
export function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] }
}

/**
 * Inject a service connector into an endpoint's __main__.py at the
 * `## build-context ##` marker.
 *
 * - guard: a substring whose presence means the connector is already wired in
 * - injection: the python snippet to append after the marker
 *
 * Returns a human-readable status string describing what happened.
 */
export function injectConnector(opts: {
  endpoint: Endpoint
  label: string
  guard: string
  injection: string
  available: string
}): string {
  const { endpoint, label, guard, injection, available } = opts
  const { pkg, name, mainPath } = endpoint

  if (!existsSync(mainPath)) {
    return `Error: endpoint not found at ${mainPath}`
  }

  let content = readFileSync(mainPath, "utf-8")
  if (!content.includes(BUILD_CONTEXT_MARKER)) {
    return `Error: marker '${BUILD_CONTEXT_MARKER}' not found in ${mainPath}`
  }
  if (content.includes(guard)) {
    return `${label} is already configured in endpoint '${pkg}/${name}'.`
  }

  content = content.replace(BUILD_CONTEXT_MARKER, BUILD_CONTEXT_MARKER + injection)
  writeFileSync(mainPath, content)

  return `Added ${label} to endpoint '${pkg}/${name}'.\nAvailable in context:\n${available}`
}
