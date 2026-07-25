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

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { BUILD_CONTEXT_MARKER, parseEndpoint, type Endpoint } from "./lib.ts"

const SECRET_NAME = /^[A-Z_][A-Z0-9_]*$/
const TRUSTABLE_MANAGED_ENV_NAMES = new Set([
  "OPS_USER",
  "OPS_PASSWORD",
  "OPS_APIHOST",
  "OPS_REPO",
  "OPS_SKILLS",
])

export interface SecretBindingStatus {
  endpoint: string
  configured: boolean
}

export interface SecretBindingResult {
  configured: string[]
  alreadyConfigured: string[]
}

export interface SecretUnbindingResult {
  removed: string[]
  alreadyAbsent: string[]
}

function normalizeEnvName(secret: string): string {
  const name = secret.trim()
  if (!SECRET_NAME.test(name)) {
    throw new Error("secret name must contain only uppercase letters, numbers, and underscores, and must not start with a number")
  }
  return name
}

export function normalizeSecretName(secret: string): string {
  const name = normalizeEnvName(secret)
  if (TRUSTABLE_MANAGED_ENV_NAMES.has(name)) {
    throw new Error(`'${name}' is a Trustable-managed runtime variable and cannot be used as an application secret or action parameter`)
  }
  return name
}

export function envNames(path = ".env"): Set<string> {
  return new Set(envValues(path).keys())
}

function envValues(path: string): Map<string, string> {
  if (!existsSync(path)) return new Map()

  const values = new Map<string, string>()
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
    if (match) values.set(match[1], match[2])
  }
  return values
}

export function hasEnvSecret(secret: string, path = ".env"): boolean {
  const name = normalizeSecretName(secret)
  // WHY: this is a value-free existence probe only. Environment mutation is
  // reserved for the Trustable UI and is intentionally absent from this MCP.
  return Boolean(envValues(path).get(name))
}

function secretInjection(secret: string): string {
  return `
#--param ${secret} "$${secret}"
def init_${secret.toLowerCase()}(args, ctx):
  value = args.get("${secret}") or os.getenv("${secret}")
  if not value:
    raise RuntimeError("Required secret ${secret} is not configured")
  setattr(ctx, "${secret}", value)
builder.append(init_${secret.toLowerCase()})`
}

function endpointLabel(endpoint: Endpoint): string {
  return `${endpoint.pkg}/${endpoint.name}`
}

export function secretBindingStatus(secret: string, endpoints: string[]): SecretBindingStatus[] {
  const name = normalizeSecretName(secret)
  return endpoints.map((value) => {
    const endpoint = parseEndpoint(value)
    const configured = existsSync(endpoint.mainPath)
      && readFileSync(endpoint.mainPath, "utf-8").includes(`#--param ${name} `)
    return { endpoint: endpointLabel(endpoint), configured }
  })
}

/**
 * Bind one secret to every endpoint only after all endpoints have passed
 * validation. This avoids a half-configured authentication flow.
 */
export function bindSecret(secret: string, endpointValues: string[]): SecretBindingResult {
  const name = normalizeSecretName(secret)
  if (!hasEnvSecret(name)) {
    throw new Error(`secret '${name}' is not configured in .env; no endpoint was changed`)
  }
  if (endpointValues.length === 0) {
    throw new Error("at least one endpoint is required")
  }

  const endpoints = endpointValues.map(parseEndpoint)
  const labels = endpoints.map(endpointLabel)
  if (new Set(labels).size !== labels.length) {
    throw new Error("endpoints must not contain duplicates")
  }

  const configured: string[] = []
  const alreadyConfigured: string[] = []
  const changes: { path: string; previous: string; next: string }[] = []

  for (const endpoint of endpoints) {
    if (!existsSync(endpoint.mainPath)) {
      throw new Error(`endpoint not found at ${endpoint.mainPath}; no endpoint was changed`)
    }

    const previous = readFileSync(endpoint.mainPath, "utf-8")
    if (!previous.includes(BUILD_CONTEXT_MARKER)) {
      throw new Error(`marker '${BUILD_CONTEXT_MARKER}' not found in ${endpoint.mainPath}; no endpoint was changed`)
    }

    const label = endpointLabel(endpoint)
    if (previous.includes(`#--param ${name} `)) {
      alreadyConfigured.push(label)
      continue
    }

    changes.push({
      path: endpoint.mainPath,
      previous,
      next: previous.replace(BUILD_CONTEXT_MARKER, BUILD_CONTEXT_MARKER + secretInjection(name)),
    })
    configured.push(label)
  }

  const written: typeof changes = []
  try {
    for (const change of changes) {
      writeFileSync(change.path, change.next)
      written.push(change)
    }
  } catch (cause) {
    for (const change of written.reverse()) {
      writeFileSync(change.path, change.previous)
    }
    throw cause
  }

  return { configured, alreadyConfigured }
}

/**
 * Remove only the exact wrapper block previously generated by the secret
 * binding tools. This is also the supported recovery path for legacy invalid
 * bindings of Trustable-managed variables such as OPS_APIHOST.
 */
export function unbindSecret(secret: string, endpointValues: string[]): SecretUnbindingResult {
  const name = normalizeEnvName(secret)
  if (endpointValues.length === 0) {
    throw new Error("at least one endpoint is required")
  }

  const endpoints = endpointValues.map(parseEndpoint)
  const labels = endpoints.map(endpointLabel)
  if (new Set(labels).size !== labels.length) {
    throw new Error("endpoints must not contain duplicates")
  }

  const injection = secretInjection(name)
  const removed: string[] = []
  const alreadyAbsent: string[] = []
  const changes: { path: string; previous: string; next: string }[] = []

  for (const endpoint of endpoints) {
    if (!existsSync(endpoint.mainPath)) {
      throw new Error(`endpoint not found at ${endpoint.mainPath}; no endpoint was changed`)
    }

    const previous = readFileSync(endpoint.mainPath, "utf-8")
    if (!previous.includes(BUILD_CONTEXT_MARKER)) {
      throw new Error(`marker '${BUILD_CONTEXT_MARKER}' not found in ${endpoint.mainPath}; no endpoint was changed`)
    }

    const label = endpointLabel(endpoint)
    if (!previous.includes(injection)) {
      alreadyAbsent.push(label)
      continue
    }

    changes.push({
      path: endpoint.mainPath,
      previous,
      next: previous.replace(injection, ""),
    })
    removed.push(label)
  }

  const written: typeof changes = []
  try {
    for (const change of changes) {
      writeFileSync(change.path, change.next)
      written.push(change)
    }
  } catch (cause) {
    for (const change of written.reverse()) {
      writeFileSync(change.path, change.previous)
    }
    throw cause
  }

  return { removed, alreadyAbsent }
}
