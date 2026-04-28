import { expect, test } from "@playwright/test"

test.describe("Locations CRUD", () => {
  test("empty state and link to /locations/new", async ({ page }) => {
    await page.goto("/locations")
    await expect(page.getByText(/No locations yet/i)).toBeVisible()
    await page.getByRole("link", { name: "New location" }).click()
    await expect(page).toHaveURL(/\/locations\/new$/)
  })

  test("create → edit → delete a location", async ({ page }) => {
    const name = `Glasswright Library ${Date.now()}`
    const description = "Vaulted archive lit by green-shaded reading lamps."

    await page.goto("/locations/new")
    await expect(page.locator("#name")).toBeFocused()

    await page.locator("#name").fill(name)
    await page.locator("#description").fill(description)
    await page.getByRole("button", { name: "Create" }).click()

    await expect(page).toHaveURL(/\/locations$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible()

    await page.getByRole("link", { name: new RegExp(name) }).click()
    await expect(page).toHaveURL(/\/locations\/[^/]+\/edit$/)
    await expect(page.locator("#name")).toHaveValue(name)
    await expect(page.locator("#description")).toHaveValue(description)

    const editedName = `${name} Restored`
    await page.locator("#name").fill(editedName)
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page).toHaveURL(/\/locations$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: editedName, level: 2 })).toBeVisible()

    await page.getByRole("link", { name: editedName, exact: false }).click()
    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(page).toHaveURL(/\/locations$/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: editedName, level: 2 })).toHaveCount(0)
  })
})
