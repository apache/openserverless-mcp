# openserverless mcp

An MCP server for OpenServerless. It exposes the OpenServerless action tools
(previously the `@opencode-ai/plugin` tools under `trustable-app/tools/`) over the
Model Context Protocol so any MCP-capable agent can drive them.

## Tools

| Tool | Description |
|---|---|
| `action_new` | Idempotently create an API endpoint (`__main__.py` + module file). `public` defaults to true. |
| `action_invoke` | Run `ops action invoke <endpoint>` with `key=value` params. |
| `action_requirements` | Add a library to an endpoint's `requirements.txt` (skips preinstalled libs). |
| `action_add_secret` | Wire a `.env` secret into an endpoint's context as `ctx.<SECRET>`. |
| `secret_status` | Check secret presence and endpoint bindings without reading its value. |
| `secret_ensure` | Generate a missing `.env` secret without returning its value. |
| `secret_bind` | Atomically bind the same secret to multiple endpoints. |
| `auth_setup` | Prepare one shared secret for token-issuing and protected endpoints. |
| `action_add_s3` | Add S3 to an endpoint's context (`ctx.S3_CLIENT`, `ctx.S3_DATA`, `ctx.S3_WEB`, `ctx.S3_PUBLIC`). |
| `action_add_postgresql` | Add PostgreSQL (`ctx.POSTGRESQL`). |
| `action_add_redis` | Add Redis (`ctx.REDIS`, `ctx.REDIS_PREFIX`). |
| `action_add_milvus` | Add Milvus vector DB (`ctx.MILVUS`). |
| `action_add_mongodb` | Add MongoDB (`ctx.MONGODB_CLIENT`, `ctx.MONGODB`). |

The `endpoint` argument is either `name` (uses the `v1` package) or `package/name`.
Repeating `action_new` for a compatible existing endpoint is a successful check
that leaves its files unchanged; incomplete paths and visibility conflicts are
reported as MCP errors.

Secret values are never returned by these tools. Missing secrets and invalid
endpoints are MCP errors (`isError: true`), so clients cannot mistake an
incomplete authentication setup for a successful tool call. `action_add_secret`
remains as the single-endpoint compatibility tool; use `secret_bind` or
`auth_setup` when several actions must share one credential.

When `OPENSERVERLESS_SECRETS_FILE` is set, `secret_ensure` also synchronizes the
requested name with that persistent env file. A value already present in the
working `.env` is copied without being returned; a persisted value is restored
to `.env` when needed. This lets hosts whose `.env` is generated keep app
secrets outside the source checkout.

## Working directory

All path-based tools operate on paths **relative to the process working
directory**: they read/write `packages/<pkg>/<name>/...` and `.env`. The server
must therefore be launched with the user's app checkout as its CWD (this is how
opencode launches `type: "local"` MCP servers).

## Layout

```
src/
  index.ts            entrypoint — registers every tool over stdio
  lib.ts              shared helpers (endpoint parsing, connector injection, types)
  secrets.ts          secret name, .env, status, and atomic binding helpers
  tools/
    new.ts            action_new
    invoke.ts         action_invoke
    requirements.ts   action_requirements
    add-secret.ts     action_add_secret
    add-s3.ts         action_add_s3
    add-postgresql.ts action_add_postgresql
    add-redis.ts      action_add_redis
    add-milvus.ts     action_add_milvus
    add-mongodb.ts    action_add_mongodb
    secret-status.ts  secret_status
    secret-ensure.ts  secret_ensure
    secret-bind.ts    secret_bind
    auth-setup.ts     auth_setup
```

Each file under `tools/` default-exports a `Tool` (`defineTool({ name, config, handler })`);
`index.ts` imports them all and registers them in a loop. To add a tool, drop a
file in `tools/` and add it to the array in `index.ts`.

## Run

Requires Node 18+ and `ops` on the `PATH`. TypeScript runs directly via `tsx`.

```bash
npm install
npm start          # tsx src/index.ts — speaks MCP over stdio
```

## Wire into opencode

Add to the app's `opencode.json`:

```json
{
  "mcp": {
    "openserverless": {
      "type": "local",
      "command": ["npx", "tsx", "/path/to/mcp/src/index.ts"],
      "enabled": true
    }
  }
}
```
