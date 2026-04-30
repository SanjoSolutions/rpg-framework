import { expect, test, type Page } from "@playwright/test"
import { isFeatureEnabled } from "./features"
import { startMockOllama, type MockOllama } from "./mock-ollama"

const USE_MOCK = process.env.MOCK_OLLAMA !== "0"
let OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434"
let OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "nemomix-unleashed-12b:latest"
let mock: MockOllama | undefined

test.beforeAll(async () => {
  if (!USE_MOCK) return
  mock = await startMockOllama()
  OLLAMA_URL = mock.url
  OLLAMA_MODEL = mock.model
})

test.afterAll(async () => {
  if (mock) await mock.close()
})

async function configureOllamaThroughUI(page: Page) {
  await page.goto("/settings")

  // Pick the Ollama LLM backend. Clicking the option only fires a PUT when
  // the value actually changes — so we inspect the option's aria-selected
  // state and only wait for the response when we're switching backend.
  await page.getByRole("combobox", { name: "LLM backend" }).click()
  const ollamaOption = page.getByRole("option", { name: /ollama/i })
  const alreadySelected = (await ollamaOption.getAttribute("aria-selected")) === "true"
  if (alreadySelected) {
    await ollamaOption.click()
  } else {
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/settings") && r.request().method() === "PUT",
      ),
      ollamaOption.click(),
    ])
  }

  // Fill the model name. The component autosaves on every onChange, so we
  // wait for the last persistence call to settle before moving on.
  const modelInput = page.getByLabel("Ollama model")
  await expect(modelInput).toBeVisible()
  await modelInput.fill(OLLAMA_MODEL)
  // Give the trailing autosave a moment.
  await page.waitForTimeout(300)

  // Default URL is http://localhost:11434 already; only adjust if different.
  const urlInput = page.getByLabel("Ollama server URL")
  await expect(urlInput).toBeVisible()
  if ((await urlInput.inputValue()) !== OLLAMA_URL) {
    await urlInput.fill(OLLAMA_URL)
    await page.waitForTimeout(300)
  }

  // The turn engine only emits a streamed reply when requireConsent is on —
  // see `src/app/api/scenarios/[id]/turn/route.ts` (`shouldStreamReply` is
  // gated on `if (requireConsent && ...)`).
  const consentSwitch = page.getByRole("switch", { name: /consent/i }).first()
  await expect(consentSwitch).toBeVisible()
  if ((await consentSwitch.getAttribute("aria-checked")) !== "true") {
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/settings") && r.request().method() === "PUT",
      ),
      consentSwitch.click(),
    ])
  }
}

async function probeOllama(): Promise<boolean> {
  if (USE_MOCK) return true
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    if (!res.ok) return false
    const json = (await res.json()) as { models?: Array<{ name?: string }> }
    return (json.models ?? []).some((m) => m.name === OLLAMA_MODEL)
  } catch {
    return false
  }
}

async function createCharacter(page: Page, name: string, description: string) {
  await page.goto("/characters/new")
  await page.locator("#name").fill(name)
  await page.locator("#description").fill(description)
  await page.getByRole("button", { name: "Create" }).click()
  await expect(page).toHaveURL(/\/characters$/, { timeout: 10_000 })
}

async function createLocation(page: Page, name: string, description: string) {
  await page.goto("/locations/new")
  await page.locator("#name").fill(name)
  await page.locator("#description").fill(description)
  await page.getByRole("button", { name: "Create" }).click()
  await expect(page).toHaveURL(/\/locations$/, { timeout: 10_000 })
}

async function createScenario(page: Page, opts: {
  name: string
  summary: string
  characterName: string
  locationName: string
}) {
  await page.goto("/scenarios/new")
  await page.locator("#name").fill(opts.name)
  await page.locator("#summary").fill(opts.summary)
  await page.getByLabel(opts.locationName).first().check()
  await page.getByLabel(opts.characterName).first().check()
  await page.getByRole("button", { name: "Create" }).click()
  await expect(page).toHaveURL(/\/scenarios\/[^/]+\/\d+$/, { timeout: 10_000 })
}

test.describe("Turn streaming against the running Ollama server", () => {
  // Real 12B model on a local box can take 30–60s for one turn; the mock
  // replies in a couple of seconds. Pick test/poll budgets accordingly.
  const REPLY_TIMEOUT = USE_MOCK ? 15_000 : 150_000
  const FINISH_TIMEOUT = USE_MOCK ? 10_000 : 60_000
  test.setTimeout(USE_MOCK ? 60_000 : 180_000)

  test("user message triggers a streamed character reply", async ({ page }) => {
    test.skip(!(await probeOllama()), `Ollama is unreachable at ${OLLAMA_URL} or model "${OLLAMA_MODEL}" is missing — skipping.`)
    test.skip(
      !(await isFeatureEnabled(page, /consent/i)),
      "requireConsent feature flag disabled in this build (turn engine streams the reply only when consent is on)",
    )

    await configureOllamaThroughUI(page)

    const stamp = Date.now()
    const characterName = `Mira ${stamp}`
    const locationName = `Old Lighthouse ${stamp}`
    const scenarioName = `Storm at the lighthouse ${stamp}`

    await createCharacter(
      page,
      characterName,
      `${characterName} is the keeper of the Old Lighthouse: weathered, plain-spoken, and quietly observant. She speaks briefly.`,
    )
    await createLocation(
      page,
      locationName,
      "A stone lighthouse on a cliff. Wind howls outside, and the lantern flickers in the gusts.",
    )
    await createScenario(page, {
      name: scenarioName,
      summary: "A traveler arrives at the lighthouse during a storm. Keep responses short.",
      characterName,
      locationName,
    })

    // We're on the play screen. Send a user message and wait for a streamed reply.
    const input = page.getByPlaceholder(/Direct the scene|Speak or act as a participant/i).first()
    await expect(input).toBeVisible()
    await input.fill("I knock on the lighthouse door, soaked from the rain. Please answer briefly.")

    // Watch the SSE turn endpoint to confirm the server actually streams.
    const turnResponsePromise = page.waitForResponse(
      (response) =>
        /\/api\/scenarios\/[^/]+\/turn$/.test(response.url()) && response.request().method() === "POST",
      { timeout: 30_000 },
    )

    await page.getByRole("button", { name: "Send" }).click()

    const turnResponse = await turnResponsePromise
    expect(turnResponse.status()).toBe(200)
    expect(turnResponse.headers()["content-type"] ?? "").toMatch(/event-stream/)

    // The user message bubble appears immediately.
    await expect(
      page.getByText("I knock on the lighthouse door", { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Wait until any new bubble appears below the user's Director message — the
    // pending-turn block plus the eventual character reply both render as
    // whitespace-pre-wrap blocks. We poll the count of those blocks; the user
    // message is one, so once the count grows the model has begun producing.
    const bodyBlocks = page.locator("div.whitespace-pre-wrap")
    await expect
      .poll(async () => bodyBlocks.count(), {
        message: "expected the model to emit a streamed reply bubble within the timeout",
        timeout: REPLY_TIMEOUT,
        intervals: [500, 1000, 2000, 4000],
      })
      .toBeGreaterThan(1)

    // The new bubble eventually contains real text from the model (not just "…").
    await expect
      .poll(
        async () => {
          const texts = await bodyBlocks.allInnerTexts()
          const reply = texts.slice(1).join(" ").trim()
          return reply.replace(/[…\s]/g, "").length
        },
        {
          message: "expected the streamed reply to contain readable content",
          timeout: REPLY_TIMEOUT,
          intervals: [1000, 2000, 4000],
        },
      )
      .toBeGreaterThan(8)

    // Once the stream is done, the Clear button (which is disabled while busy)
    // becomes enabled — that's the cleanest signal that the turn finished.
    await expect(page.getByRole("button", { name: "Clear" })).toBeEnabled({ timeout: FINISH_TIMEOUT })

    // Typing a new message re-enables the Send button.
    await input.fill("Anything else?")
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled()
  })
})
