Implement the tools as separate tools in folder tools/

Rule: an action is stored folder `packages/<package>/<name>`, functions is a synonym for action.

Rule: assume the packages referenced by the tools are already available and preinstalled.

Rule: `action-add-secret`, `action-add-s3`, `action-add-redis`, `action-add-postgresql`, and `action-add-milvus` are idempotent — if the secret or service is already present in `__main__.py`, skip the injection silently and return a message saying it is already configured.

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

The resulting `<package>/<name>`.

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

First checks the secret is available in `.env`. If not, warn the user and suggest to add it to the environment.

- adds in `__main__.py` after "## build-context ##":

```
#--param <MY_SECRET> "$<MY_SECRET>"
builder.append(lambda args, ctx: setattr(ctx, '<MY_SECRET>', args.get("<MY_SECRET>", os.getenv("<MY_SECRET>"))))
```

## returns

Information on the updated context.

# tool action-add-s3

## parameters

Receive an <endpoint> (`name` or `package/name`).

## generation

This tool adds S3 to the context of an endpoint/action/function, making available:
- `ctx.S3_CLIENT` — the S3 client
- `ctx.S3_DATA` — the S3 data bucket (private)
- `ctx.S3_WEB` — the S3 web bucket (public)
- `ctx.S3_PUBLIC` — the public URL to access S3

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
  ctx.REDIS = redis.from_url(args.get("REDIS_URL", os.getenv("REDIS_URL")))
  ctx.REDIS_PREFIX = args.get("REDIS_PREFIX", os.getenv("REDIS_PREFIX"))
builder.append(init_redis)
```

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
