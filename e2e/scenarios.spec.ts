import { expect, test } from "@playwright/test"

async function createCharacter(page: import("@playwright/test").Page, name: string) {
  await page.goto("/characters/new")
  await page.locator("#name").fill(name)
  await page.locator("#description").fill(`${name}'s background description.`)
  await page.getByRole("button", { name: "Create" }).click()
  await expect(page).toHaveURL(/\/characters$/, { timeout: 10_000 })
}

async function createLocation(page: import("@playwright/test").Page, name: string) {
  await page.goto("/locations/new")
  await page.locator("#name").fill(name)
  await page.locator("#description").fill(`${name} is a dimly lit place.`)
  await page.getByRole("button", { name: "Create" }).click()
  await expect(page).toHaveURL(/\/locations$/, { timeout: 10_000 })
}

test.describe("Scenarios CRUD", () => {
  test("empty state and link to /scenarios/new", async ({ page }) => {
    await page.goto("/scenarios")
    await expect(page.getByText(/No scenarios yet/i)).toBeVisible()
    await page.getByRole("link", { name: "New scenario" }).click()
    await expect(page).toHaveURL(/\/scenarios\/new$/)
  })

  test("scenario form prompts to create dependencies when none exist", async ({ page }) => {
    await page.goto("/scenarios/new")
    // Without characters/locations, the form shows inline links to create them.
    await expect(page.getByRole("link", { name: "Create one" }).first()).toBeVisible()
  })

  test("create scenario with a character and location, then edit and delete", async ({ page }) => {
    const stamp = Date.now()
    const characterName = `Mira ${stamp}`
    const locationName = `Old Lighthouse ${stamp}`
    const scenarioName = `Stormy night ${stamp}`
    const summary = "Mira shelters in the lighthouse during a sudden gale."

    await createCharacter(page, characterName)
    await createLocation(page, locationName)

    await page.goto("/scenarios/new")
    await expect(page.locator("#name")).toBeFocused()
    await page.locator("#name").fill(scenarioName)
    await page.locator("#summary").fill(summary)

    // Pick the location (its checkbox is keyed by id; match via label).
    await page.getByLabel(locationName).first().check()
    // Pick the character.
    await page.getByLabel(characterName).first().check()

    await page.getByRole("button", { name: "Create" }).click()

    // Server redirects to /scenarios/<id>.
    await expect(page).toHaveURL(/\/scenarios\/[^/]+$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: scenarioName, level: 1 })).toBeVisible()
    await expect(page.getByText(`at ${locationName}`, { exact: false }).first()).toBeVisible()
    await expect(page.getByText(characterName, { exact: false }).first()).toBeVisible()

    // From the play screen, navigate to edit.
    await page.getByRole("link", { name: "Edit" }).click()
    await expect(page).toHaveURL(/\/scenarios\/[^/]+\/edit$/)
    await expect(page.locator("#name")).toHaveValue(scenarioName)
    await expect(page.locator("#summary")).toHaveValue(summary)

    // Edit the summary.
    const editedSummary = `${summary} The lantern flickers ominously.`
    await page.locator("#summary").fill(editedSummary)
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page).toHaveURL(/\/scenarios\/[^/]+$/, { timeout: 10_000 })

    // Verify on the listing page.
    await page.goto("/scenarios")
    await expect(page.getByRole("link", { name: scenarioName })).toBeVisible()
    await expect(page.getByText(editedSummary)).toBeVisible()

    // Delete from the edit screen.
    await page.getByRole("link", { name: scenarioName }).click()
    await page.getByRole("link", { name: "Edit" }).click()
    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(page).toHaveURL(/\/scenarios$/, { timeout: 10_000 })
    await expect(page.getByRole("link", { name: scenarioName })).toHaveCount(0)
  })

  test("scenario list links to Edit and Play actions per row", async ({ page }) => {
    const stamp = Date.now()
    const characterName = `Bryn ${stamp}`
    const locationName = `Coast Path ${stamp}`
    const scenarioName = `Dawn walk ${stamp}`

    await createCharacter(page, characterName)
    await createLocation(page, locationName)

    await page.goto("/scenarios/new")
    await page.locator("#name").fill(scenarioName)
    await page.locator("#summary").fill("Quiet introductory walk.")
    await page.getByLabel(locationName).first().check()
    await page.getByLabel(characterName).first().check()
    await page.getByRole("button", { name: "Create" }).click()
    await expect(page).toHaveURL(/\/scenarios\/[^/]+$/, { timeout: 10_000 })

    await page.goto("/scenarios")
    const row = page.locator("li", { hasText: scenarioName })
    await expect(row.getByRole("link", { name: "Edit" })).toBeVisible()
    await expect(row.getByRole("link", { name: "Play" })).toBeVisible()

    await row.getByRole("link", { name: "Play" }).click()
    await expect(page).toHaveURL(/\/scenarios\/[^/]+$/)
    await expect(page.getByRole("heading", { name: scenarioName, level: 1 })).toBeVisible()
  })
})
