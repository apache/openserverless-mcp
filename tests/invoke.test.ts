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

import assert from "node:assert/strict"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import test from "node:test"
import actionInvoke from "../src/tools/invoke.ts"

function resultText(result: { content: { text: string }[] }): string {
  return result.content.map((part) => part.text).join("\n")
}

test("action_invoke returns the action result instead of an activation id", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openserverless-mcp-invoke-test-"))
  const bin = join(directory, "bin")
  const ops = join(bin, "ops")
  const previousPath = process.env.PATH
  mkdirSync(bin)
  writeFileSync(ops, `#!/usr/bin/env node
const args = process.argv.slice(2)
const resultOnly = args[0] === "invoke" || args.includes("-r")
process.stdout.write(resultOnly ? '{"answer":42}\\n' : "ok: invoked /_/v1/demo with id activation-123\\n")
`)
  chmodSync(ops, 0o755)

  try {
    process.env.PATH = `${bin}${delimiter}${previousPath ?? ""}`
    const result = await actionInvoke.handler({ endpoint: "v1/demo", params: ["key=value"] })
    assert.equal(result.isError, undefined)
    assert.equal(resultText(result), '{"answer":42}\n')
  } finally {
    process.env.PATH = previousPath
    rmSync(directory, { recursive: true, force: true })
  }
})
