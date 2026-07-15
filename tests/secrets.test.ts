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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import actionAddS3 from "../src/tools/add-s3.ts"
import actionAddSecret from "../src/tools/add-secret.ts"
import actionAddRedis from "../src/tools/add-redis.ts"
import actionNew from "../src/tools/new.ts"
import authSetup from "../src/tools/auth-setup.ts"
import secretBind from "../src/tools/secret-bind.ts"
import secretEnsure from "../src/tools/secret-ensure.ts"
import secretUnbind from "../src/tools/secret-unbind.ts"

function resultText(result: { content: { text: string }[] }): string {
  return result.content.map((part) => part.text).join("\n")
}

function endpoint(path: string): string {
  const [pkg, name] = path.split("/")
  const dir = join("packages", pkg, name)
  mkdirSync(dir, { recursive: true })
  const main = `#--kind python:default
import os
builder = []
## build-context ##
`
  writeFileSync(join(dir, "__main__.py"), main)
  return main
}

function inTemporaryProject(run: () => void): void {
  const previous = process.cwd()
  const directory = mkdtempSync(join(tmpdir(), "openserverless-mcp-test-"))
  try {
    process.chdir(directory)
    run()
  } finally {
    process.chdir(previous)
    rmSync(directory, { recursive: true, force: true })
  }
}

test("secret_ensure creates an idempotent secret without returning its value", () => {
  inTemporaryProject(() => {
    const persistent = join(process.cwd(), "state", "secrets.env")
    const previous = process.env.OPENSERVERLESS_SECRETS_FILE
    process.env.OPENSERVERLESS_SECRETS_FILE = persistent
    try {
      const first = secretEnsure.handler({ secret: "JWT_SECRET", bytes: 32 })
      assert.equal(first.isError, undefined)
      const env = readFileSync(".env", "utf-8")
      const value = env.trim().split("=", 2)[1]
      assert.ok(value.length >= 43)
      assert.equal(resultText(first).includes(value), false)
      assert.equal(readFileSync(persistent, "utf-8"), env)

      const second = secretEnsure.handler({ secret: "JWT_SECRET", bytes: 64 })
      assert.equal(second.isError, undefined)
      assert.equal(readFileSync(".env", "utf-8"), env)
    } finally {
      if (previous === undefined) delete process.env.OPENSERVERLESS_SECRETS_FILE
      else process.env.OPENSERVERLESS_SECRETS_FILE = previous
    }
  })
})

test("action_add_secret reports a real MCP error when the secret is absent", () => {
  inTemporaryProject(() => {
    const original = endpoint("v1/login")
    const result = actionAddSecret.handler({ endpoint: "v1/login", secret: "JWT_SECRET" })
    assert.equal(result.isError, true)
    assert.match(resultText(result), /not configured in \.env/)
    assert.equal(readFileSync("packages/v1/login/__main__.py", "utf-8"), original)
  })
})

test("secret tools reject Trustable-managed runtime variables", () => {
  inTemporaryProject(() => {
    writeFileSync(".env", "OPS_APIHOST=http://miniops.me\n")
    const original = endpoint("v1/stack-status")

    const bind = actionAddSecret.handler({
      endpoint: "v1/stack-status",
      secret: "OPS_APIHOST",
    })
    assert.equal(bind.isError, true)
    assert.match(resultText(bind), /Trustable-managed runtime variable/)
    assert.equal(readFileSync("packages/v1/stack-status/__main__.py", "utf-8"), original)

    const ensure = secretEnsure.handler({ secret: "OPS_APIHOST", bytes: 32 })
    assert.equal(ensure.isError, true)
    assert.match(resultText(ensure), /Trustable-managed runtime variable/)
    assert.equal(readFileSync(".env", "utf-8"), "OPS_APIHOST=http://miniops.me\n")
  })
})

test("secret_unbind removes legacy managed bindings without reading env values", () => {
  inTemporaryProject(() => {
    const original = endpoint("v1/stack-status")
    const injection = `
#--param OPS_APIHOST "$OPS_APIHOST"
def init_ops_apihost(args, ctx):
  value = args.get("OPS_APIHOST") or os.getenv("OPS_APIHOST")
  if not value:
    raise RuntimeError("Required secret OPS_APIHOST is not configured")
  setattr(ctx, "OPS_APIHOST", value)
builder.append(init_ops_apihost)`
    writeFileSync(
      "packages/v1/stack-status/__main__.py",
      original.replace("## build-context ##", "## build-context ##" + injection),
    )

    const result = secretUnbind.handler({
      secret: "OPS_APIHOST",
      endpoints: ["v1/stack-status"],
    })
    assert.equal(result.isError, undefined)
    assert.match(resultText(result), /Removed from: v1\/stack-status/)
    assert.match(resultText(result), /ops ide undeploy <endpoint>.*ops ide deploy <endpoint>/)
    assert.equal(readFileSync("packages/v1/stack-status/__main__.py", "utf-8"), original)

    const repeated = secretUnbind.handler({
      secret: "OPS_APIHOST",
      endpoints: ["v1/stack-status"],
    })
    assert.equal(repeated.isError, undefined)
    assert.match(resultText(repeated), /Already absent from: v1\/stack-status/)
  })
})

test("secret_bind validates every endpoint before changing any wrapper", () => {
  inTemporaryProject(() => {
    writeFileSync(".env", "JWT_SECRET=not-returned\n")
    const original = endpoint("v1/login")

    const failed = secretBind.handler({
      secret: "JWT_SECRET",
      endpoints: ["v1/login", "v1/me"],
    })
    assert.equal(failed.isError, true)
    assert.equal(readFileSync("packages/v1/login/__main__.py", "utf-8"), original)

    endpoint("v1/me")
    const configured = secretBind.handler({
      secret: "JWT_SECRET",
      endpoints: ["v1/login", "v1/me"],
    })
    assert.equal(configured.isError, undefined)
    assert.equal(resultText(configured).includes("not-returned"), false)

    for (const name of ["login", "me"]) {
      const wrapper = readFileSync(`packages/v1/${name}/__main__.py`, "utf-8")
      assert.match(wrapper, /#--param JWT_SECRET "\$JWT_SECRET"/)
      assert.match(wrapper, /Required secret JWT_SECRET is not configured/)
      assert.doesNotMatch(wrapper, /args\.get\("JWT_SECRET", os\.getenv/)
    }

    const repeated = secretBind.handler({
      secret: "JWT_SECRET",
      endpoints: ["v1/login", "v1/me"],
    })
    assert.equal(repeated.isError, undefined)
    assert.match(resultText(repeated), /Already configured: v1\/login, v1\/me/)
  })
})

test("auth_setup generates one undisclosed secret and binds token plus protected endpoints", () => {
  inTemporaryProject(() => {
    for (const name of ["register", "login", "me", "projects"]) endpoint(`v1/${name}`)

    const result = authSetup.handler({
      secret: "JWT_SECRET",
      token_endpoints: ["v1/register", "v1/login"],
      protected_endpoints: ["v1/me", "v1/projects"],
      generate_if_missing: true,
    })
    assert.equal(result.isError, undefined)
    const value = readFileSync(".env", "utf-8").trim().split("=", 2)[1]
    assert.equal(resultText(result).includes(value), false)
    assert.match(resultText(result), /All token creation and validation code must use ctx\.JWT_SECRET/)

    for (const name of ["register", "login", "me", "projects"]) {
      assert.match(readFileSync(`packages/v1/${name}/__main__.py`, "utf-8"), /#--param JWT_SECRET/)
    }
  })
})

test("existing tools expose validation failures as MCP errors", () => {
  inTemporaryProject(() => {
    const result = actionNew.handler({ endpoint: "nested/path/value", public: true })
    assert.equal(result.isError, true)
  })
})

test("action_add_redis installs its runtime dependency and migrates text responses", () => {
  inTemporaryProject(() => {
    endpoint("v1/cache")

    const first = actionAddRedis.handler({ endpoint: "v1/cache" })
    assert.equal(first.isError, undefined)
    assert.equal(readFileSync("packages/v1/cache/requirements.txt", "utf-8"), "redis\n")
    assert.match(
      readFileSync("packages/v1/cache/__main__.py", "utf-8"),
      /redis\.from_url\(.+decode_responses=True\)/,
    )

    const repeated = actionAddRedis.handler({ endpoint: "v1/cache" })
    assert.equal(repeated.isError, undefined)
    assert.match(resultText(repeated), /already in requirements\.txt/)
    assert.equal(readFileSync("packages/v1/cache/requirements.txt", "utf-8"), "redis\n")
  })
})

test("action_add_s3 exposes the scoped-bucket read/write verification contract", () => {
  inTemporaryProject(() => {
    endpoint("v1/storage")

    const result = actionAddS3.handler({ endpoint: "v1/storage" })
    assert.equal(result.isError, undefined)
    const output = resultText(result)
    assert.match(output, /never call list_buckets\(\)/i)
    assert.match(output, /ctx\.S3_DATA/)
    assert.match(output, /put_object/)
    assert.match(output, /get_object/)
    assert.match(output, /compare the returned Body bytes/)
    assert.match(output, /delete_object/)
    assert.match(output, /head_bucket.*neither read nor write/i)
  })
})

test("action_new treats an existing compatible endpoint as a successful no-op", () => {
  inTemporaryProject(() => {
    const created = actionNew.handler({ endpoint: "v1/projects", public: true })
    assert.equal(created.isError, undefined)

    const modulePath = "packages/v1/projects/projects.py"
    writeFileSync(modulePath, "# user implementation\n")

    const repeated = actionNew.handler({ endpoint: "v1/projects", public: true })
    assert.equal(repeated.isError, undefined)
    assert.match(resultText(repeated), /Check passed: endpoint already exists/)
    assert.equal(readFileSync(modulePath, "utf-8"), "# user implementation\n")
  })
})

test("action_new reports incompatible existing paths as MCP errors", () => {
  inTemporaryProject(() => {
    mkdirSync("packages/v1/incomplete", { recursive: true })
    const incomplete = actionNew.handler({ endpoint: "v1/incomplete", public: true })
    assert.equal(incomplete.isError, true)
    assert.match(resultText(incomplete), /not a valid endpoint/)

    actionNew.handler({ endpoint: "v1/private-action", public: false })
    const visibilityConflict = actionNew.handler({ endpoint: "v1/private-action", public: true })
    assert.equal(visibilityConflict.isError, true)
    assert.match(resultText(visibilityConflict), /requested public=true/)
  })
})
