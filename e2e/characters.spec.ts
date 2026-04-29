import { expect, test } from "@playwright/test"

test.describe("Characters CRUD", () => {
  test("empty state shows guidance copy", async ({ page }) => {
    await page.goto("/characters")
    await expect(page.getByText(/No characters yet/i)).toBeVisible()
    await expect(page.getByRole("link", { name: "New character" })).toBeVisible()
  })

  test("create → list → edit → delete a character", async ({ page }) => {
    const name = `Aria ${Date.now()}`
    const description = "Curious archivist who hoards forbidden manuscripts."
    const appearance = "Tall, ink-stained fingers, owlish glasses."

    await page.goto("/characters")
    await page.getByRole("link", { name: "New character" }).click()
    await expect(page).toHaveURL(/\/characters\/new$/)
    await expect(page.getByRole("heading", { name: "New character" })).toBeVisible()

    // Name autofocus is part of the spec.
    await expect(page.locator("#name")).toBeFocused()

    await page.locator("#name").fill(name)
    await page.locator("#appearance").fill(appearance)
    await page.locator("#description").fill(description)

    await page.getByRole("button", { name: "Create" }).click()

    await expect(page).toHaveURL(/\/characters$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible()
    await expect(page.getByText(description)).toBeVisible()

    // Open the character for editing.
    await page.getByRole("link", { name: new RegExp(name) }).click()
    await expect(page).toHaveURL(/\/characters\/[^/]+\/edit$/)

    await expect(page.locator("#name")).toHaveValue(name)
    await expect(page.locator("#description")).toHaveValue(description)
    await expect(page.locator("#appearance")).toHaveValue(appearance)

    // Edit description and save.
    const editedDescription = `${description} Now also a reluctant detective.`
    await page.locator("#description").fill(editedDescription)
    await page.getByRole("button", { name: "Save" }).click()

    await expect(page).toHaveURL(/\/characters$/, { timeout: 10_000 })
    await expect(page.getByText(editedDescription)).toBeVisible()

    // Delete from the edit view.
    await page.getByRole("link", { name: new RegExp(name) }).click()
    await expect(page).toHaveURL(/\/characters\/[^/]+\/edit$/)

    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: "Delete" }).click()

    await expect(page).toHaveURL(/\/characters$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name, level: 2 })).toHaveCount(0)
  })

  test("submitting an empty name keeps the user on the form", async ({ page }) => {
    await page.goto("/characters/new")
    await page.getByRole("button", { name: "Create" }).click()
    // Required field is enforced by the browser → URL stays on /new.
    await expect(page).toHaveURL(/\/characters\/new$/)
  })

  test("TTS voice select offers a Default voice option", async ({ page }) => {
    await page.goto("/characters/new")
    await page.getByRole("combobox", { name: /TTS voice/i }).click()
    await expect(page.getByRole("option", { name: "Default voice" })).toBeVisible()
  })
})
