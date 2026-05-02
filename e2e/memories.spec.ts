import { expect, test } from "@playwright/test"

test.describe("Memories page", () => {
  test("renders heading and description", async ({ page }) => {
    // Memories are gated behind a settings toggle but the page itself is reachable.
    await page.goto("/memories")
    await expect(page.getByRole("heading", { name: "Memories", level: 1 })).toBeVisible()
    await expect(page.getByText(/What each character remembers/i)).toBeVisible()
  })
})

test.describe("404 handling", () => {
  test("unknown route returns 404", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist")
    expect(response?.status()).toBe(404)
  })
})
