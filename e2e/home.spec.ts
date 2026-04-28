import { expect, test } from "@playwright/test"

test.describe("Home page", () => {
  test("renders the title and three section links", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "RPG Framework", level: 1 })).toBeVisible()
    await expect(page.getByRole("link", { name: /Characters/ }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: /Locations/ }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: /Scenarios/ }).first()).toBeVisible()
  })

  test("Characters tile navigates to /characters", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: /Characters/ }).first().click()
    await expect(page).toHaveURL(/\/characters$/)
    await expect(page.getByRole("heading", { name: "Characters", level: 1 })).toBeVisible()
  })

  test("Locations tile navigates to /locations", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: /Locations/ }).first().click()
    await expect(page).toHaveURL(/\/locations$/)
    await expect(page.getByRole("heading", { name: "Locations", level: 1 })).toBeVisible()
  })

  test("Scenarios tile navigates to /scenarios", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: /Scenarios/ }).first().click()
    await expect(page).toHaveURL(/\/scenarios$/)
    await expect(page.getByRole("heading", { name: "Scenarios", level: 1 })).toBeVisible()
  })
})

test.describe("Top navigation", () => {
  test("navbar links route to each main page", async ({ page }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation").first()

    await nav.getByRole("link", { name: "Characters" }).click()
    await expect(page).toHaveURL(/\/characters$/)

    await nav.getByRole("link", { name: "Locations" }).click()
    await expect(page).toHaveURL(/\/locations$/)

    await nav.getByRole("link", { name: "Scenarios" }).click()
    await expect(page).toHaveURL(/\/scenarios$/)

    await nav.getByRole("link", { name: "Settings" }).click()
    await expect(page).toHaveURL(/\/settings$/)

    await page.getByRole("link", { name: "RPG Framework" }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})
