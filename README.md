# openserverless mcp

An MCP server for OpenServerless. It exposes the OpenServerless action tools
(previously the `@opencode-ai/plugin` tools under `trustable-app/tools/`) over the
Model Context Protocol so any MCP-capable agent can drive them.

## Tools

| Tool | Description |
|---|---|
| `action_new` | Create a new API endpoint (`__main__.py` + module file). `public` defaults to true. |
| `action_invoke` | Run `ops action invoke <endpoint>` with `key=value` params. |
| `action_requirements` | Add a library to an endpoint's `requirements.txt` (skips preinstalled libs). |
| `action_add_secret` | Wire a `.env` secret into an endpoint's context as `ctx.<SECRET>`. |
| `action_add_s3` | Add S3 to an endpoint's context (`ctx.S3_CLIENT`, `ctx.S3_DATA`, `ctx.S3_WEB`, `ctx.S3_PUBLIC`). |
| `action_add_postgresql` | Add PostgreSQL (`ctx.POSTGRESQL`). |
| `action_add_redis` | Add Redis (`ctx.REDIS`, `ctx.REDIS_PREFIX`). |
| `action_add_milvus` | Add Milvus vector DB (`ctx.MILVUS`). |

The `endpoint` argument is either `name` (uses the `v1` package) or `package/name`.

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
  tools/
    new.ts            action_new
    invoke.ts         action_invoke
    requirements.ts   action_requirements
    add-secret.ts     action_add_secret
    add-s3.ts         action_add_s3
    add-postgresql.ts action_add_postgresql
    add-redis.ts      action_add_redis
    add-milvus.ts     action_add_milvus
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
