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
import { z } from "zod"
import { parseEndpoint, text, defineTool, endpointArg } from "../lib.ts"

const PREINSTALLED = [
  "requests", "ollama", "openai", "pymilvus", "redis", "pyyaml", "boto3",
  "psycopg", "beautifulsoup4", "pillow", "nltk", "httplib2", "kafka_python",
  "python-dateutil", "scrapy", "simplejson", "twisted", "netifaces", "pymongo",
  "minio", "langdetect", "plotly", "joblib", "lightgbm", "feedparser", "numpy",
  "scikit-learn", "langchain", "langchain-ollama", "langchain-openai", "bcrypt",
]

export default defineTool({
  name: "action_requirements",
  config: {
    description: "Add a library to an endpoint's requirements.txt. Skips if the library is preinstalled.",
    inputSchema: {
      endpoint: endpointArg,
      library: z.string().describe("The Python library name to add"),
    },
  },
  handler({ endpoint, library }) {
    let ep
    try {
      ep = parseEndpoint(endpoint)
    } catch (e) {
      return text(`Error: ${(e as Error).message}`)
    }
    const lib = library.trim()
    const { dir } = ep

    if (!existsSync(dir)) {
      return text(`Error: endpoint not found at ${dir}`)
    }

    const normalizedLib = lib.toLowerCase().replace(/-/g, "_")
    const isPreinstalled = PREINSTALLED.some(
      (p) => p.toLowerCase().replace(/-/g, "_") === normalizedLib,
    )
    if (isPreinstalled) {
      return text(`Library '${lib}' is preinstalled and available. No action needed.`)
    }

    const reqPath = join(dir, "requirements.txt")
    let existing = ""
    if (existsSync(reqPath)) {
      existing = readFileSync(reqPath, "utf-8")
    }

    const lines = existing.split("\n").map((l) => l.trim()).filter(Boolean)
    const alreadyAdded = lines.some(
      (l) => l.toLowerCase().replace(/-/g, "_") === normalizedLib,
    )
    if (alreadyAdded) {
      return text(`Library '${lib}' is already in requirements.txt.`)
    }

    lines.push(lib)
    writeFileSync(reqPath, lines.join("\n") + "\n")

    return text(`Added '${lib}' to ${reqPath}`)
  },
})
