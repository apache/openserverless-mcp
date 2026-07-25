Implement the tools as separate tools in folder tools/

Rule: an action is stored folder `packages/<package>/<name>`, functions is a synonym for action.

Rule: assume the packages referenced by the tools are already available and preinstalled.

Rule: `action-add-secret`, `action-add-s3`, `action-add-redis`, `action-add-postgresql`, `action-add-milvus`, and `action-add-mongodb` are idempotent — if the secret or service is already present in `__main__.py`, skip the injection silently and return a message saying it is already configured.

Rule: application authentication uses Redis-backed opaque sessions. It never
uses JWT, an application signing secret, or an MCP-generated environment value.

Implement the following tools in folder tools/ using this template:

```
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "<description>",
  args: {
    <arg>: tool.schema.<type>().describe("<arg description>"),
  },
  async execute(args) {
    <tool logic>
    return `<results>`
  },
})
```

Generate each tools as standalone scripts,  avoid separate helpers files, duplicate code if needed.

# tool action-new

This tool creates a new action — public (API endpoint) or private (typically for initializations).

## parameters

Receive an <endpoint> (`name` or `package/name`, defaults to `v1` package) and an optional <public> flag (defaults to `true`). Set `public: false` to create a private action (used for initialization tasks in the `init` package).

- ensure package and name only contain letters, numbers and '-' and start with a letter
- <module> is the name with '-' replaced with '_' (example: 'new-user' becomes 'new_user')

## generation

- create a folder `packages/<package>/<name>`

- write a file `packages/<package>/<name>/__main__.py` with the content (where `<public>` is `true` or `false`):

```
#--kind python:default
#--web <public>
# Note: this timeout is 5 minutes - 10 minutes is max allowed
#--timeout 300000
import types, os, <module>

builder = []
## build-context ##

def main(args):
  try:
    ctx = types.SimpleNamespace()
    for fn in builder: fn(args, ctx)
    return { "body": <module>.main(args, ctx=ctx) }
  except Exception as e:
    import traceback
    traceback.print_exc()
    return {
      "body": {"error": str(e) },
      "statusCode": 500
    }
```

- write a file `packages/<package>/<name>/<module>.py` with the content:

```
def main(args, ctx=None):
  inp = args.get("input", "<module>")
  out = inp
  return out
```

## returns

The resulting `<package>/<name>`. Creation is idempotent: when a compatible
endpoint with `__main__.py` already exists, leave every file unchanged and
return a successful check/no-op result. An existing incomplete path or an
explicit `public` mismatch is a conflict and returns `isError: true`.

# tool action-invoke

This tool invokes an api action.

## parameters

Receive an <endpoint> (`package/action`) and a series of key=value pairs.

## executes

the command `ops action invoke <endpoint> -p "<key1>" "<value1>" ... -p "<keyn>" "<valuen>"`

## returns

the json output of the command

# tool action-add-secret

## parameters

Receive an <endpoint> (`name` or `package/name`) and a <secret> name.

## generation

This tool adds a new secret <MY_SECRET> to an endpoint/action/function.

First checks the secret is available in `.env`. If it is absent, return an MCP
error with `isError: true` and do not modify the endpoint.

Trustable-managed runtime variables are not application secrets and must be
rejected even when they exist in `.env`: `OPS_USER`, `OPS_PASSWORD`,
`OPS_APIHOST`, `OPS_REPO`, and `OPS_SKILLS`. In particular, the tool must never
generate `#--param OPS_APIHOST "$OPS_APIHOST"`; `OPS_APIHOST` belongs to the
Trustable/`ops ide` orchestration process, not to action runtime context.

- adds in `__main__.py` after "## build-context ##":

```
#--param <MY_SECRET> "$<MY_SECRET>"
def init_<my_secret>(args, ctx):
  value = args.get("<MY_SECRET>") or os.getenv("<MY_SECRET>")
  if not value:
    raise RuntimeError("Required secret <MY_SECRET> is not configured")
  setattr(ctx, "<MY_SECRET>", value)
builder.append(init_<my_secret>)
```

## returns

Information on the updated context.

# tool secret-status

Receive a secret name and an optional endpoint list. Report only whether the
name exists in `.env` and whether each generated wrapper contains the matching
parameter binding. Never read or return the value.

Application `.env` and `.env.production` files are owned exclusively by the
Trustable user-facing configuration flow. This MCP may perform a value-free
presence check needed to validate a binding, but it must not expose a tool that
creates, edits, imports, synchronizes, regenerates, or automatically populates
either file. Missing variables are MCP errors and must be reported to the user
for configuration through Trustable.

# tool secret-bind

Receive a secret name and a non-empty endpoint list. Validate the secret and
every wrapper before writing anything, then add the same strict `ctx.<SECRET>`
binding to every endpoint. The operation is idempotent and must not leave only
some endpoints configured when validation fails.

# tool secret-unbind

Receive one bound parameter name and a non-empty endpoint list. Validate every
generated wrapper before changing anything, then atomically remove only the
exact binding block produced by the secret tools. Do not read or delete the
value from `.env`. The operation is idempotent and is the supported recovery
path for legacy invalid bindings of Trustable-managed variables such as
`OPS_APIHOST`. When a binding is removed, the tool must instruct the caller to
recreate every changed endpoint with `ops ide undeploy <endpoint>` followed by
`ops ide deploy <endpoint>`, because updating an existing OpenWhisk action
without the parameter does not remove the previously deployed binding.
`ops ide clean` is insufficient because it removes only local build artifacts.

# tool auth-setup

Receive three non-empty endpoint lists:

- token endpoints that issue a session, such as login and registration;
- protected endpoints that validate the session, including `me`/session and
  every protected resource;
- logout endpoints that revoke the session.

Validate the complete endpoint set before changing any file, then atomically
apply the same Redis connector as `action-add-redis` to every unique endpoint.
If validation or writing fails, leave or restore every endpoint unchanged.
This tool must never read or write `.env` or `.env.production`.

The result instructs editable action modules to:

- verify password hashes with bcrypt;
- generate a cryptographically random opaque token;
- build a Redis key from `ctx.REDIS_PREFIX` without adding a duplicate
  separator, plus an app-local `session:<token>` suffix;
- store a token-to-identity mapping with a bounded TTL;
- derive identity and authorization only from that server-side record on every
  protected request;
- delete the record on logout;
- return only the opaque token to the browser.

JWT, application signing secrets, browser-supplied user identifiers, and direct
generated-wrapper edits are forbidden alternatives.

# MCP error semantics

Validation failures, missing files, failed child commands, and missing required
secrets return `isError: true`. Human-readable text beginning with `Error:` or
`Warning:` is not a substitute for MCP failure status.

Expected idempotent no-ops, including creating an endpoint that is already
present with compatible visibility, return normal successful results so MCP
clients render them as completed checks rather than failures.

# tool action-add-s3

## parameters

Receive an <endpoint> (`name` or `package/name`).

## generation

This tool adds S3 to the context of an endpoint/action/function, making available:
- `ctx.S3_CLIENT` — the S3 client
- `ctx.S3_DATA` — the S3 data bucket (private)
- `ctx.S3_WEB` — the S3 web bucket (public)
- `ctx.S3_PUBLIC` — the public URL to access S3

The generated credentials are scoped to the configured application buckets.
Action code must never call `ctx.S3_CLIENT.list_buckets()`. Bucket listing,
`head_bucket`, or object listing is not proof of read/write access. A service
read/write check must create a unique temporary key in `ctx.S3_DATA` with
`put_object`, read it with `get_object`, compare the returned body bytes, and
remove it with `delete_object` in a `finally` block. It may report read/write
success only after the comparison succeeds.

- adds in `__main__.py` after "## build-context ##":

```
#--param S3_HOST "$S3_HOST"
#--param S3_PORT "$S3_PORT"
#--param S3_ACCESS_KEY "$S3_ACCESS_KEY"
#--param S3_SECRET_KEY "$S3_SECRET_KEY"
#--param S3_BUCKET_DATA "$S3_BUCKET_DATA"
#--param S3_BUCKET_STATIC "$S3_BUCKET_STATIC"
#--param S3_PUBLIC "$OPSDEV_S3"
import boto3
from botocore.client import Config
def init_s3(args, ctx):
  host = args.get("S3_HOST", os.getenv("S3_HOST"))
  port = args.get("S3_PORT", os.getenv("S3_PORT"))
  url = f"http://{host}:{port}"
  key = args.get("S3_ACCESS_KEY", os.getenv("S3_ACCESS_KEY"))
  sec = args.get("S3_SECRET_KEY", os.getenv("S3_SECRET_KEY"))
  cfg = Config(signature_version='s3v4')
  ctx.S3_CLIENT = boto3.client('s3', region_name='us-east-1', endpoint_url=url, aws_access_key_id=key, aws_secret_access_key=sec, config=cfg)
  ctx.S3_DATA = args.get("S3_BUCKET_DATA", os.getenv("S3_BUCKET_DATA"))
  ctx.S3_WEB = args.get("S3_BUCKET_STATIC", os.getenv("S3_BUCKET_STATIC"))
  ctx.S3_PUBLIC = args.get("S3_PUBLIC", os.getenv("OPSDEV_S3"))
builder.append(init_s3)
```

## returns

Information on the updated context.

# tool action-add-redis

## parameters

Receive an <endpoint> (`name` or `package/name`).

## generation

This tool adds a Redis connection to an endpoint/action/function, making available:
- `ctx.REDIS` — the Redis client
- `ctx.REDIS_PREFIX` — the key prefix

- adds in `__main__.py` after "## build-context ##":

```
#--param REDIS_URL "$REDIS_URL"
#--param REDIS_PREFIX "$REDIS_PREFIX"
import redis
def init_redis(args, ctx):
  ctx.REDIS = redis.from_url(args.get("REDIS_URL", os.getenv("REDIS_URL")), decode_responses=True)
  ctx.REDIS_PREFIX = args.get("REDIS_PREFIX", os.getenv("REDIS_PREFIX"))
builder.append(init_redis)
```

The tool must also add `redis` to the endpoint `requirements.txt`, because the
default Python action runtime does not guarantee that client library. Repeated
calls are idempotent and upgrade an existing generated Redis connector to
`decode_responses=True` so action results contain JSON-safe strings rather than
raw bytes.

Authenticated application pages use Redis-backed opaque sessions. After every
login, registration, `me`/session, protected-resource, and logout endpoint
exists, the caller must use `auth-setup` once with the complete endpoint sets;
use `action-add-redis` directly only for unrelated single-endpoint Redis use.
Login or registration creates a cryptographically random opaque token and
stores only its token-to-identity mapping in Redis with a bounded TTL. Every
Redis key must be derived from `ctx.REDIS_PREFIX`; protected endpoints validate
the record and derive identity from it, and logout deletes it. JWT and
application signing secrets are not an alternative to this session contract.

## returns

Information on the updated context.

# tool action-add-postgresql

## parameters

Receive an <endpoint> (`name` or `package/name`).

## generation

This tool adds a PostgreSQL connection to an endpoint/action/function, making available:
- `ctx.POSTGRESQL` — the psycopg connection

- adds in `__main__.py` after "## build-context ##":

```
#--param POSTGRES_URL "$POSTGRES_URL"
import psycopg
def init_postgresql(args, ctx):
  dburl = args.get("POSTGRES_URL", os.getenv("POSTGRES_URL"))
  ctx.POSTGRESQL = psycopg.connect(dburl)
builder.append(init_postgresql)
```

## returns

Information on the updated context.

# tool action-add-milvus

## parameters

Receive an <endpoint> (`name` or `package/name`).

## generation

This tool adds a Milvus vector DB connection to an endpoint/action/function, making available:
- `ctx.MILVUS` — the MilvusClient instance

- adds in `__main__.py` after "## build-context ##":

```
#--param MILVUS_HOST "$MILVUS_HOST"
#--param MILVUS_PORT "$MILVUS_PORT"
#--param MILVUS_DB_NAME "$MILVUS_DB_NAME"
#--param MILVUS_TOKEN "$MILVUS_TOKEN"
from pymilvus import MilvusClient
def init_milvus(args, ctx):
  host = args.get('MILVUS_HOST', os.getenv('MILVUS_HOST'))
  port = args.get('MILVUS_PORT', os.getenv('MILVUS_PORT'))
  uri = f"http://{host}:{port}"
  token = args.get("MILVUS_TOKEN", os.getenv("MILVUS_TOKEN"))
  db_name = args.get("MILVUS_DB_NAME", os.getenv("MILVUS_DB_NAME"))
  ctx.MILVUS = MilvusClient(uri=uri, token=token, db_name=db_name)
builder.append(init_milvus)
```

## returns

Information on the updated context.

# tool action-add-mongodb

## parameters

Receive an <endpoint> (`name` or `package/name`).

## generation

This tool adds a MongoDB connection to an endpoint/action/function, making available:
- `ctx.MONGODB_CLIENT` — the MongoClient instance
- `ctx.MONGODB` — the default MongoDB database from the connection string

- adds in `__main__.py` after "## build-context ##":

```
#--param MONGODB_URI "$MONGODB_URI"
from pymongo import MongoClient
def init_mongodb(args, ctx):
  uri = args.get("MONGODB_URI", os.getenv("MONGODB_URI"))
  if not uri:
    raise RuntimeError("MONGODB_URI is not configured for this action")
  ctx.MONGODB_CLIENT = MongoClient(uri)
  ctx.MONGODB = ctx.MONGODB_CLIENT.get_default_database()
builder.append(init_mongodb)
```

## returns

Information on the updated context.

# tool action-requirements

## parameters

Receive an <endpoint> (`name` or `package/name`) and a <library> name.

## generation

The tool will do nothing when one of the following libraries is required (use the available version), otherwise will add the library to the file

packages/<package>/<name>/requirements.txt

- requests
- ollama
- openai
- pymilvus
- redis
- pyyaml
- boto3
- psycopg
- beautifulsoup4
- pillow
- nltk
- httplib2
- kafka_python
- python-dateutil
- scrapy
- simplejson
- twisted
- netifaces
- pymongo
- minio
- langdetect
- plotly
- joblib
- lightgbm
- feedparser
- numpy
- scikit-learn
- langchain
- langchain-ollama
- langchain-openai
- bcrypt
