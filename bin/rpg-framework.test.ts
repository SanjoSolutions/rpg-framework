import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const cliPath = resolve(process.cwd(), "bin/rpg-framework.mjs")
const launcherPath = resolve(process.cwd(), "scripts/sea/launcher.cjs")

interface CapturedRequest {
  method: string
  path: string
  body: unknown
}

const cleanupTasks: Array<() => Promise<void>> = []

afterEach(async () => {
  const tasks = cleanupTasks.splice(0)
  await Promise.all(tasks.map((task) => task()))
})

describe("rpg-framework CLI", () => {
  it("calls arbitrary API endpoints with JSON bodies", async () => {
    const captured: CapturedRequest[] = []
    const { baseUrl } = await startServer(async (request, response) => {
      captured.push(await captureRequest(request))
      json(response, { character: { id: "c1", name: "Aria" } }, 201)
    })

    const { stdout } = await runCli(baseUrl, [
      "api",
      "POST",
      "/api/characters",
      "--data",
      '{"name":"Aria"}',
    ])

    expect(JSON.parse(stdout)).toEqual({ character: { id: "c1", name: "Aria" } })
    expect(captured).toEqual([
      {
        method: "POST",
        path: "/api/characters",
        body: { name: "Aria" },
      },
    ])
  })

  it("maps resource commands to the matching API requests", async () => {
    const captured: CapturedRequest[] = []
    const { baseUrl } = await startServer(async (request, response) => {
      captured.push(await captureRequest(request))
      json(response, { character: { id: "c1", name: "Mira" } }, 201)
    })

    await runCli(baseUrl, [
      "characters",
      "create",
      "--name",
      "Mira",
      "--appearance",
      "Blue cloak",
      "--description",
      "A careful guide",
      "--voice",
      "Eve",
    ])

    expect(captured).toEqual([
      {
        method: "POST",
        path: "/api/characters",
        body: {
          name: "Mira",
          appearance: "Blue cloak",
          description: "A careful guide",
          voice: "Eve",
        },
      },
    ])
  })

  it("reads request bodies from files for structured commands", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "rpg-cli-"))
    cleanupTasks.push(() => rm(tempDir, { recursive: true, force: true }))
    const bodyPath = join(tempDir, "scenario.json")
    await writeFile(
      bodyPath,
      JSON.stringify({
        name: "Market Morning",
        summary: "A busy square.",
        characterIds: ["c1", "c2"],
      }),
    )

    const captured: CapturedRequest[] = []
    const { baseUrl } = await startServer(async (request, response) => {
      captured.push(await captureRequest(request))
      json(response, { scenario: { id: "s1" } }, 201)
    })

    await runCli(baseUrl, ["scenarios", "create", "--file", bodyPath])

    expect(captured).toEqual([
      {
        method: "POST",
        path: "/api/scenarios",
        body: {
          name: "Market Morning",
          summary: "A busy square.",
          characterIds: ["c1", "c2"],
        },
      },
    ])
  })

  it("streams turn deltas as readable text by default", async () => {
    const { baseUrl } = await startServer(async (_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      response.write('event: speaker\ndata: {"name":"Aria"}\n\n')
      response.write('event: delta\ndata: {"content":"Hello"}\n\n')
      response.write('event: delta\ndata: {"content":" there."}\n\n')
      response.end("event: done\ndata: {}\n\n")
    })

    const { stdout, stderr } = await runCli(baseUrl, ["scenarios", "turn", "s1"])

    expect(stderr).toContain("Aria:")
    expect(stdout).toBe("Hello there.\n")
  })

  it("writes TTS audio responses to disk", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "rpg-cli-"))
    cleanupTasks.push(() => rm(tempDir, { recursive: true, force: true }))
    const outputPath = join(tempDir, "voice.mp3")
    const captured: CapturedRequest[] = []

    const { baseUrl } = await startServer(async (request, response) => {
      captured.push(await captureRequest(request))
      response.writeHead(200, { "Content-Type": "audio/mpeg" })
      response.end(Buffer.from("mp3 bytes"))
    })

    const { stderr } = await runCli(baseUrl, [
      "tts",
      "speak",
      "--voice",
      "Eve",
      "--text",
      "Hello",
      "--output",
      outputPath,
    ])

    await expect(readFile(outputPath, "utf8")).resolves.toBe("mp3 bytes")
    expect(stderr).toContain(`Wrote ${outputPath}`)
    expect(captured).toEqual([
      {
        method: "POST",
        path: "/api/tts",
        body: { voice: "Eve", text: "Hello" },
      },
    ])
  })
})

describe("SEA launcher", () => {
  it("starts the bundled server when called with no arguments", async () => {
    const appDir = await createFakeBundledApp()

    const { stdout } = await runLauncher(appDir, [])

    expect(JSON.parse(stdout)).toEqual({ kind: "server", args: [] })
  })

  it("starts the bundled server with explicit server commands", async () => {
    const appDir = await createFakeBundledApp()

    const { stdout } = await runLauncher(appDir, ["serve"])

    expect(JSON.parse(stdout)).toEqual({ kind: "server", args: [] })
  })

  it("runs the bundled CLI when arguments are present", async () => {
    const appDir = await createFakeBundledApp()

    const { stdout } = await runLauncher(appDir, ["characters", "list"])

    expect(JSON.parse(stdout)).toEqual({ kind: "cli", args: ["characters", "list"] })
  })
})

async function runCli(baseUrl: string, args: string[]) {
  return execFileAsync(process.execPath, [cliPath, "--base-url", baseUrl, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: "1" },
  })
}

async function runLauncher(appDir: string, args: string[]) {
  return execFileAsync(process.execPath, [launcherPath, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NO_COLOR: "1",
      RPG_FRAMEWORK_APP_DIR: appDir,
    },
  })
}

async function createFakeBundledApp() {
  const appDir = await mkdtemp(join(tmpdir(), "rpg-launcher-"))
  cleanupTasks.push(() => rm(appDir, { recursive: true, force: true }))
  await mkdir(join(appDir, "bin"), { recursive: true })
  await writeFile(
    join(appDir, "server.js"),
    "console.log(JSON.stringify({ kind: 'server', args: process.argv.slice(2) }))\n",
  )
  await writeFile(join(appDir, "package.json"), '{ "type": "commonjs" }\n')
  await writeFile(
    join(appDir, "bin", "rpg-framework.cjs"),
    "console.log(JSON.stringify({ kind: 'cli', args: process.argv.slice(2) }))\n",
  )
  return appDir
}

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void,
) {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error: unknown) => {
      response.writeHead(500, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: String(error) }))
    })
  })
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise))
  cleanupTasks.push(
    () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()))
      }),
  )
  const address = server.address()
  if (typeof address !== "object" || address === null) {
    throw new Error("Server address is unavailable")
  }
  return { baseUrl: `http://127.0.0.1:${address.port}` }
}

async function captureRequest(request: IncomingMessage): Promise<CapturedRequest> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const rawBody = Buffer.concat(chunks).toString("utf8")
  return {
    method: request.method ?? "GET",
    path: request.url ?? "/",
    body: rawBody ? JSON.parse(rawBody) : undefined,
  }
}

function json(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "Content-Type": "application/json" })
  response.end(JSON.stringify(body))
}
