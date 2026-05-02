#!/usr/bin/env node

import { createWriteStream } from "node:fs"
import { readFile } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import { Command, Option } from "commander"

const DEFAULT_BASE_URL = "http://127.0.0.1:3000"

const program = new Command()
  .name("rpg-framework")
  .description("Command line client for the local RPG Framework API")
  .version("0.3.0")
  .option("-b, --base-url <url>", "API base URL", DEFAULT_BASE_URL)
  .option("--pretty", "Pretty-print JSON responses", true)

program
  .command("api")
  .description("Call any API endpoint directly")
  .argument("<method>", "HTTP method")
  .argument("<path>", "API path, for example /api/characters")
  .option("-d, --data <json>", "JSON request body")
  .option("-f, --file <path>", "Read JSON request body from a file, or - for stdin")
  .option("-o, --output <path>", "Write response body to a file")
  .option("--raw", "Print raw response text")
  .action(async (method, path, options) => {
    const body = await readJsonBody(options)
    const response = await apiRequest(path, { method, body })
    await outputResponse(response, options)
  })

addCharacters(program)
addLocations(program)
addScenarios(program)
addMemories(program)
addSettings(program)
addTts(program)
addWebhooks(program)
addAssist(program)

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

function addCharacters(root) {
  const command = root.command("characters").description("Manage characters")
  command
    .command("list")
    .description("List characters")
    .action(() => printJsonRequest("/api/characters"))
  command
    .command("get")
    .argument("<id>")
    .description("Get a character")
    .action((id) => printJsonRequest(`/api/characters/${encodeURIComponent(id)}`))
  command
    .command("create")
    .description("Create a character")
    .option("--name <name>")
    .option("--appearance <text>")
    .option("--description <text>")
    .option("--voice <voice>")
    .option("--stranger-name <name>")
    .option("-d, --data <json>", "JSON request body")
    .option("-f, --file <path>", "Read JSON request body from a file, or - for stdin")
    .action(async (options) => {
      await printJsonRequest("/api/characters", {
        method: "POST",
        body: await bodyFromOptions(options, characterPatch(options)),
      })
    })
  command
    .command("update")
    .argument("<id>")
    .description("Update a character")
    .option("--name <name>")
    .option("--appearance <text>")
    .option("--description <text>")
    .option("--voice <voice>")
    .option("--stranger-name <name>")
    .option("-d, --data <json>", "JSON request body")
    .option("-f, --file <path>", "Read JSON request body from a file, or - for stdin")
    .action(async (id, options) => {
      await printJsonRequest(`/api/characters/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: await bodyFromOptions(options, characterPatch(options)),
      })
    })
  command
    .command("delete")
    .argument("<id>")
    .description("Delete a character")
    .action((id) =>
      printJsonRequest(`/api/characters/${encodeURIComponent(id)}`, { method: "DELETE" }),
    )
}

function addLocations(root) {
  const command = root.command("locations").description("Manage locations")
  command.command("list").description("List locations").action(() => printJsonRequest("/api/locations"))
  command
    .command("get")
    .argument("<id>")
    .description("Get a location")
    .action((id) => printJsonRequest(`/api/locations/${encodeURIComponent(id)}`))
  command
    .command("create")
    .description("Create a location")
    .option("--name <name>")
    .option("--description <text>")
    .option("-d, --data <json>", "JSON request body")
    .option("-f, --file <path>", "Read JSON request body from a file, or - for stdin")
    .action(async (options) => {
      await printJsonRequest("/api/locations", {
        method: "POST",
        body: await bodyFromOptions(options, compact({
          name: options.name,
          description: options.description,
        })),
      })
    })
  command
    .command("update")
    .argument("<id>")
    .description("Update a location")
    .option("--name <name>")
    .option("--description <text>")
    .option("-d, --data <json>", "JSON request body")
    .option("-f, --file <path>", "Read JSON request body from a file, or - for stdin")
    .action(async (id, options) => {
      await printJsonRequest(`/api/locations/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: await bodyFromOptions(options, compact({
          name: options.name,
          description: options.description,
        })),
      })
    })
  command
    .command("delete")
    .argument("<id>")
    .description("Delete a location")
    .action((id) =>
      printJsonRequest(`/api/locations/${encodeURIComponent(id)}`, { method: "DELETE" }),
    )
}

function addScenarios(root) {
  const command = root.command("scenarios").description("Manage scenarios and play")
  command.command("list").description("List scenarios").action(() => printJsonRequest("/api/scenarios"))
  command
    .command("get")
    .argument("<id>")
    .description("Get a scenario")
    .action((id) => printJsonRequest(`/api/scenarios/${encodeURIComponent(id)}`))
  command
    .command("create")
    .description("Create a scenario")
    .option("--name <name>")
    .option("--summary <text>")
    .option("--location-id <id>")
    .addOption(new Option("--character-id <id>", "Attach a character").argParser(collect).default([]))
    .addOption(new Option("--location <id>", "Attach a location").argParser(collect).default([]))
    .option("--character-locations <json>", "JSON object of character placements")
    .option("-d, --data <json>", "JSON request body")
    .option("-f, --file <path>", "Read JSON request body from a file, or - for stdin")
    .action(async (options) => {
      await printJsonRequest("/api/scenarios", {
        method: "POST",
        body: await bodyFromOptions(options, scenarioPatch(options)),
      })
    })
  command
    .command("update")
    .argument("<id>")
    .description("Update a scenario")
    .option("--name <name>")
    .option("--summary <text>")
    .option("--location-id <id>")
    .addOption(new Option("--character-id <id>", "Attach a character").argParser(collect).default([]))
    .addOption(new Option("--location <id>", "Attach a location").argParser(collect).default([]))
    .option("--character-locations <json>", "JSON object of character placements")
    .option("-d, --data <json>", "JSON request body")
    .option("-f, --file <path>", "Read JSON request body from a file, or - for stdin")
    .action(async (id, options) => {
      await printJsonRequest(`/api/scenarios/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: await bodyFromOptions(options, scenarioPatch(options)),
      })
    })
  command
    .command("delete")
    .argument("<id>")
    .description("Delete a scenario")
    .action((id) =>
      printJsonRequest(`/api/scenarios/${encodeURIComponent(id)}`, { method: "DELETE" }),
    )
  command
    .command("instances")
    .argument("<scenarioId>")
    .description("List scenario instances")
    .action((scenarioId) =>
      printJsonRequest(`/api/scenarios/${encodeURIComponent(scenarioId)}/instances`),
    )
  command
    .command("new-instance")
    .argument("<scenarioId>")
    .description("Create the next scenario instance")
    .action((scenarioId) =>
      printJsonRequest(`/api/scenarios/${encodeURIComponent(scenarioId)}/instances`, {
        method: "POST",
      }),
    )
  command
    .command("messages")
    .argument("<scenarioId>")
    .option("-i, --instance <number>", "Instance number", "1")
    .description("List instance messages")
    .action((scenarioId, options) =>
      printJsonRequest(instancePath(scenarioId, options.instance, "messages")),
    )
  command
    .command("add-message")
    .argument("<scenarioId>")
    .requiredOption("--content <text>")
    .option("-i, --instance <number>", "Instance number", "1")
    .option("--role <role>", "director or participant")
    .option("--speaker-name <name>")
    .description("Append a user-authored message")
    .action((scenarioId, options) =>
      printJsonRequest(instancePath(scenarioId, options.instance, "messages"), {
        method: "POST",
        body: compact({
          content: options.content,
          role: options.role,
          speakerName: options.speakerName,
        }),
      }),
    )
  command
    .command("message")
    .argument("<scenarioId>")
    .argument("<messageId>")
    .option("-i, --instance <number>", "Instance number", "1")
    .description("Get a message")
    .action((scenarioId, messageId, options) =>
      printJsonRequest(instancePath(scenarioId, options.instance, `messages/${encodeURIComponent(messageId)}`)),
    )
  command
    .command("delete-message")
    .argument("<scenarioId>")
    .argument("<messageId>")
    .option("-i, --instance <number>", "Instance number", "1")
    .description("Delete a message")
    .action((scenarioId, messageId, options) =>
      printJsonRequest(instancePath(scenarioId, options.instance, `messages/${encodeURIComponent(messageId)}`), {
        method: "DELETE",
      }),
    )
  command
    .command("move")
    .argument("<scenarioId>")
    .option("-i, --instance <number>", "Instance number", "1")
    .option("--character-id <id>")
    .option("--location-id <id>")
    .option("--scene", "Set active scene")
    .option("--player", "Move the player")
    .description("Move a character, the player, or the active scene")
    .action((scenarioId, options) =>
      printJsonRequest(instancePath(scenarioId, options.instance, "move"), {
        method: "POST",
        body: {
          characterId: options.characterId,
          locationId: options.locationId ?? null,
          setActive: Boolean(options.scene),
          target: options.player ? "player" : undefined,
        },
      }),
    )
  command
    .command("memories")
    .argument("<scenarioId>")
    .option("-i, --instance <number>", "Instance number", "1")
    .description("List scene memories")
    .action((scenarioId, options) =>
      printJsonRequest(instancePath(scenarioId, options.instance, "memories")),
    )
  command
    .command("turn")
    .argument("<scenarioId>")
    .option("-i, --instance <number>", "Instance number", "1")
    .option("--events", "Print Server-Sent Events as JSON lines")
    .description("Generate the next turn")
    .action(async (scenarioId, options) => {
      const response = await apiRequest(instancePath(scenarioId, options.instance, "turn"), {
        method: "POST",
      })
      await printTurnStream(response, { events: options.events })
    })
}

function addMemories(root) {
  const command = root.command("memories").description("Manage memories")
  command
    .command("list")
    .option("--owner-character-id <id>")
    .description("List memories")
    .action((options) => {
      const suffix = options.ownerCharacterId
        ? `?ownerCharacterId=${encodeURIComponent(options.ownerCharacterId)}`
        : ""
      return printJsonRequest(`/api/memories${suffix}`)
    })
  command
    .command("get")
    .argument("<id>")
    .description("Get a memory")
    .action((id) => printJsonRequest(`/api/memories/${encodeURIComponent(id)}`))
  command
    .command("create")
    .requiredOption("--owner-character-id <id>")
    .requiredOption("--content <text>")
    .option("--location-id <id>")
    .addOption(new Option("--associated-character-id <id>", "Associate a character").argParser(collect).default([]))
    .description("Create a memory")
    .action((options) =>
      printJsonRequest("/api/memories", {
        method: "POST",
        body: compact({
          ownerCharacterId: options.ownerCharacterId,
          content: options.content,
          locationId: options.locationId,
          associatedCharacterIds: options.associatedCharacterId,
        }),
      }),
    )
  command
    .command("update")
    .argument("<id>")
    .option("--content <text>")
    .option("--location-id <id>")
    .addOption(new Option("--associated-character-id <id>", "Associate a character").argParser(collect).default([]))
    .description("Update a memory")
    .action((id, options) =>
      printJsonRequest(`/api/memories/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: compact({
          content: options.content,
          locationId: options.locationId,
          associatedCharacterIds:
            options.associatedCharacterId.length > 0 ? options.associatedCharacterId : undefined,
        }),
      }),
    )
  command
    .command("delete")
    .argument("<id>")
    .description("Delete a memory")
    .action((id) => printJsonRequest(`/api/memories/${encodeURIComponent(id)}`, { method: "DELETE" }))
}

function addSettings(root) {
  const command = root.command("settings").description("Manage settings")
  command.command("get").description("Show settings").action(() => printJsonRequest("/api/settings"))
  command
    .command("update")
    .description("Update settings")
    .option("--llm-backend <backend>")
    .option("--tts-backend <backend>")
    .option("--xai-api-key <key>")
    .option("--ollama-url <url>")
    .option("--ollama-model <model>")
    .option("--player-name <name>")
    .option("--require-consent <boolean>")
    .option("--memories-enabled <boolean>")
    .option("--learn-names <boolean>")
    .option("-d, --data <json>", "JSON request body")
    .option("-f, --file <path>", "Read JSON request body from a file, or - for stdin")
    .action(async (options) => {
      await printJsonRequest("/api/settings", {
        method: "PUT",
        body: await bodyFromOptions(options, compact({
          llmBackend: options.llmBackend,
          ttsBackend: options.ttsBackend,
          xaiApiKey: options.xaiApiKey,
          ollamaUrl: options.ollamaUrl,
          ollamaModel: options.ollamaModel,
          playerName: options.playerName,
          requireConsent: parseBooleanOption(options.requireConsent),
          memoriesEnabled: parseBooleanOption(options.memoriesEnabled),
          learnNames: parseBooleanOption(options.learnNames),
        })),
      })
    })
}

function addTts(root) {
  const command = root.command("tts").description("Use text-to-speech")
  command.command("voices").description("List voices").action(() => printJsonRequest("/api/tts/voices"))
  command.command("health").description("Check TTS availability").action(() => printJsonRequest("/api/tts/health"))
  command
    .command("speak")
    .requiredOption("--voice <voice>")
    .requiredOption("--text <text>")
    .option("-o, --output <path>", "Output MP3 path", "tts.mp3")
    .description("Generate speech audio")
    .action(async (options) => {
      const response = await apiRequest("/api/tts", {
        method: "POST",
        body: { voice: options.voice, text: options.text },
      })
      if (response.headers.get("content-type")?.includes("application/json")) {
        await outputResponse(response, {})
        return
      }
      await writeResponseToFile(response, options.output)
      console.error(`Wrote ${options.output}`)
    })
}

function addWebhooks(root) {
  const command = root.command("webhooks").description("Manage webhooks")
  command.command("list").description("List webhooks").action(() => printJsonRequest("/api/webhooks"))
  command
    .command("get")
    .argument("<id>")
    .description("Get a webhook")
    .action((id) => printJsonRequest(`/api/webhooks/${encodeURIComponent(id)}`))
  command
    .command("create")
    .requiredOption("--url <url>")
    .addOption(new Option("--event <event>", "Subscribed event").argParser(collect).default([]))
    .option("--secret <secret>")
    .option("--enabled <boolean>")
    .option("--description <text>")
    .description("Create a webhook")
    .action((options) =>
      printJsonRequest("/api/webhooks", {
        method: "POST",
        body: compact({
          url: options.url,
          events: options.event,
          secret: options.secret,
          enabled: parseBooleanOption(options.enabled),
          description: options.description,
        }),
      }),
    )
  command
    .command("update")
    .argument("<id>")
    .requiredOption("--url <url>")
    .addOption(new Option("--event <event>", "Subscribed event").argParser(collect).default([]))
    .option("--secret <secret>")
    .option("--enabled <boolean>")
    .option("--description <text>")
    .description("Update a webhook")
    .action((id, options) =>
      printJsonRequest(`/api/webhooks/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: compact({
          url: options.url,
          events: options.event,
          secret: options.secret,
          enabled: parseBooleanOption(options.enabled),
          description: options.description,
        }),
      }),
    )
  command
    .command("delete")
    .argument("<id>")
    .description("Delete a webhook")
    .action((id) => printJsonRequest(`/api/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }))
  command
    .command("test")
    .argument("<id>")
    .description("Send a test webhook")
    .action((id) => printJsonRequest(`/api/webhooks/${encodeURIComponent(id)}/test`, { method: "POST" }))
}

function addAssist(root) {
  root
    .command("assist")
    .description("Generate a field proposal")
    .requiredOption("--entity-type <type>")
    .requiredOption("--field <field>")
    .requiredOption("--entity <json>")
    .option("--request <text>", "")
    .action((options) =>
      printJsonRequest("/api/assist", {
        method: "POST",
        body: {
          entityType: options.entityType,
          field: options.field,
          entity: parseJson(options.entity, "--entity"),
          request: options.request ?? "",
        },
      }),
    )
}

async function printJsonRequest(path, init = {}) {
  const response = await apiRequest(path, init)
  await outputResponse(response, {})
}

async function apiRequest(path, init = {}) {
  const options = program.opts()
  const url = new URL(path, options.baseUrl)
  const headers = {}
  let body
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(init.body)
  }
  const response = await fetch(url, {
    method: (init.method ?? "GET").toUpperCase(),
    headers,
    body,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return response
}

async function outputResponse(response, options) {
  if (options.output) {
    await writeResponseToFile(response, options.output)
    return
  }
  const contentType = response.headers.get("content-type") ?? ""
  if (options.raw || !contentType.includes("application/json")) {
    process.stdout.write(await response.text())
    return
  }
  const value = await response.json()
  process.stdout.write(formatJson(value))
  process.stdout.write("\n")
}

async function writeResponseToFile(response, outputPath) {
  if (!response.body) throw new Error("Response body is empty")
  await pipeline(response.body, createWriteStream(outputPath))
}

async function printTurnStream(response, options) {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("text/event-stream")) {
    await outputResponse(response, {})
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let boundary = buffer.indexOf("\n\n")
    while (boundary >= 0) {
      const raw = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      printSseEvent(raw, options)
      boundary = buffer.indexOf("\n\n")
    }
  }
  if (buffer.trim()) printSseEvent(buffer, options)
  if (!options.events) process.stdout.write("\n")
}

function printSseEvent(raw, options) {
  const event = { event: "message", data: "" }
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) event.event = line.slice(6).trim()
    if (line.startsWith("data:")) event.data += line.slice(5).trim()
  }
  let data
  try {
    data = event.data ? JSON.parse(event.data) : {}
  } catch {
    data = event.data
  }
  if (options.events) {
    process.stdout.write(`${JSON.stringify({ event: event.event, data })}\n`)
    return
  }
  if (event.event === "speaker" && data?.name) {
    process.stderr.write(`${data.name}: `)
  } else if (event.event === "delta" && data?.content) {
    process.stdout.write(data.content)
  } else if (event.event === "error") {
    process.stderr.write(`\n${data?.message ?? "Turn failed"}\n`)
  }
}

async function readJsonBody(options) {
  if (options.file) {
    const text = options.file === "-" ? await readStdin() : await readFile(options.file, "utf8")
    return parseJson(text, options.file === "-" ? "stdin" : options.file)
  }
  if (options.data) return parseJson(options.data, "--data")
  return undefined
}

async function bodyFromOptions(options, fallback) {
  return (await readJsonBody(options)) ?? fallback
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

function parseJson(text, source) {
  try {
    return JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON from ${source}: ${detail}`)
  }
}

function collect(value, previous) {
  return [...previous, value]
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )
}

function parseBooleanOption(value) {
  if (value === undefined) return undefined
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  throw new Error(`Expected boolean value, received ${value}`)
}

function characterPatch(options) {
  return compact({
    name: options.name,
    appearance: options.appearance,
    description: options.description,
    voice: options.voice,
    strangerName: options.strangerName,
  })
}

function scenarioPatch(options) {
  return compact({
    name: options.name,
    summary: options.summary,
    locationId: options.locationId,
    characterIds: options.characterId,
    locationIds: options.location,
    characterLocations: options.characterLocations
      ? parseJson(options.characterLocations, "--character-locations")
      : undefined,
  })
}

function instancePath(scenarioId, instance, suffix) {
  return `/api/scenarios/${encodeURIComponent(scenarioId)}/${encodeURIComponent(instance)}/${suffix}`
}

function formatJson(value) {
  return JSON.stringify(value, null, program.opts().pretty ? 2 : 0)
}
