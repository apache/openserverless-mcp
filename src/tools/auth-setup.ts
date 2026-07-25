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

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { BUILD_CONTEXT_MARKER, defineTool, endpointArg, error, parseEndpoint, text } from "../lib.ts"
import actionAddRedis from "./add-redis.ts"

interface FileSnapshot {
  path: string
  existed: boolean
  content: string
}

function snapshot(path: string): FileSnapshot {
  return {
    path,
    existed: existsSync(path),
    content: existsSync(path) ? readFileSync(path, "utf-8") : "",
  }
}

function restore(files: FileSnapshot[]): void {
  for (const file of files) {
    if (file.existed) writeFileSync(file.path, file.content)
    else rmSync(file.path, { force: true })
  }
}

export default defineTool({
  name: "auth_setup",
  config: {
    description: "Atomically add Redis session wiring to the complete authentication surface: token issuers (login/registration), token validators (me/session and every protected resource), and logout. This tool never reads or writes .env. Generated auth must use bcrypt password verification plus a cryptographically random opaque token stored as a prefix-safe ctx.REDIS_PREFIX key with a bounded TTL; protected endpoints derive identity from Redis and logout deletes the record. JWT and application signing secrets are forbidden.",
    inputSchema: {
      token_endpoints: z.array(endpointArg).min(1).describe("All endpoints that issue an authenticated session, such as v1/login and v1/register"),
      protected_endpoints: z.array(endpointArg).min(1).describe("The me/session endpoint and every endpoint that requires an authenticated identity"),
      logout_endpoints: z.array(endpointArg).min(1).describe("All endpoints that revoke an authenticated session, normally v1/logout"),
    },
  },
  async handler({ token_endpoints, protected_endpoints, logout_endpoints }) {
    const endpoints = [...new Set([...token_endpoints, ...protected_endpoints, ...logout_endpoints])]
    const parsed: ReturnType<typeof parseEndpoint>[] = []

    try {
      // WHY: validate the complete graph before writing anything. A missing
      // protected endpoint must not leave only login wired, which would make
      // the application appear authenticated while its backend is unusable.
      for (const endpoint of endpoints) {
        const action = parseEndpoint(endpoint)
        if (!existsSync(action.mainPath)) {
          return error(`Authentication setup failed: endpoint not found at ${action.mainPath}. No endpoint was changed.`)
        }
        const wrapper = readFileSync(action.mainPath, "utf-8")
        if (!wrapper.includes(BUILD_CONTEXT_MARKER)) {
          return error(`Authentication setup failed: marker '${BUILD_CONTEXT_MARKER}' not found in ${action.mainPath}. No endpoint was changed.`)
        }
        parsed.push(action)
      }

      const snapshots = parsed.flatMap((action) => [
        snapshot(action.mainPath),
        snapshot(join(action.dir, "requirements.txt")),
      ])

      try {
        for (const endpoint of endpoints) {
          const result = await actionAddRedis.handler({ endpoint })
          if (result.isError) {
            restore(snapshots)
            const detail = result.content.map((part) => part.text).join("\n")
            return error(`Authentication setup failed while wiring '${endpoint}': ${detail}. All endpoint files were restored.`)
          }
        }
      } catch (cause) {
        restore(snapshots)
        throw cause
      }

      return text([
        `Redis authentication wiring is ready for ${endpoints.length} endpoints: ${endpoints.join(", ")}.`,
        "Token endpoints must verify password hashes with bcrypt, generate a cryptographically random opaque token, and store only a token-to-identity record in Redis with a bounded TTL.",
        "Build keys without duplicate separators: append an app-local 'session:<token>' suffix to ctx.REDIS_PREFIX, adding ':' only when the configured prefix does not already end with it.",
        "Protected endpoints must read the Bearer token, load the Redis record, derive user id and roles only from that record, and fail closed when it is absent or expired.",
        "Logout endpoints must delete the same Redis record. The browser stores only the opaque token.",
        "Do not use JWT, an application signing secret, browser-supplied user ids, or direct edits to generated __main__.py wrappers.",
      ].join("\n"))
    } catch (cause) {
      return error(`Authentication setup failed: ${(cause as Error).message}`)
    }
  },
})
