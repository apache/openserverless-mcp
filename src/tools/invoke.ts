import { execFile } from "node:child_process"
import { z } from "zod"
import { text, defineTool } from "../lib.ts"

export default defineTool({
  name: "action_invoke",
  config: {
    description: "Invoke an API action. Executes `ops action invoke` with the given endpoint and key=value parameters.",
    inputSchema: {
      endpoint: z.string().describe("The endpoint path: 'package/action'"),
      params: z
        .array(z.string())
        .optional()
        .describe("Key=value pairs to pass as parameters (e.g. ['key1=value1', 'key2=value2'])"),
    },
  },
  async handler({ endpoint, params }) {
    const paramArgs: string[] = []
    if (params) {
      for (const kv of params) {
        const eqIdx = kv.indexOf("=")
        if (eqIdx === -1) {
          return text(`Error: invalid parameter '${kv}', expected key=value format`)
        }
        paramArgs.push("-p", kv.substring(0, eqIdx), kv.substring(eqIdx + 1))
      }
    }

    const argv = ["action", "invoke", endpoint.trim(), ...paramArgs]

    const { stdout, stderr, exitCode } = await new Promise<{
      stdout: string
      stderr: string
      exitCode: number
    }>((resolve) => {
      execFile("ops", argv, { maxBuffer: 1024 * 1024 * 64 }, (err, out, errOut) => {
        const code = err && typeof (err as any).code === "number" ? (err as any).code : err ? 1 : 0
        resolve({ stdout: out ?? "", stderr: errOut ?? "", exitCode: code })
      })
    })

    let result = ""
    if (stdout) result += stdout
    if (stderr) result += `\nSTDERR:\n${stderr}`
    if (exitCode !== 0) result += `\nExit code: ${exitCode}`
    return text(result || "(no output)")
  },
})
