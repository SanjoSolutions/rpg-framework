import { expect, test } from "@playwright/test"

test.describe("Settings page", () => {
  test("renders backend selectors and gameplay toggles", async ({ page }) => {
    await page.goto("/settings")
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible()

    await expect(page.getByText("LLM backend")).toBeVisible()
    await expect(page.getByText("TTS backend")).toBeVisible()

    await expect(page.getByRole("combobox", { name: "LLM backend" })).toBeVisible()
    await expect(page.getByRole("combobox", { name: "TTS backend" })).toBeVisible()
  })

  test("toggling Memories persists across reload", async ({ page }) => {
    await page.goto("/settings")

    const memoriesSwitch = page.getByRole("switch", { name: /memor/i }).first()
    await expect(memoriesSwitch).toBeVisible()

    const before = await memoriesSwitch.getAttribute("aria-checked")
    const expected = before === "true" ? "false" : "true"

    // Click and wait for the persistence request to settle.
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/settings") && response.request().method() === "PUT",
      ),
      memoriesSwitch.click(),
    ])
    await expect(memoriesSwitch).toHaveAttribute("aria-checked", expected)

    await page.reload()
    const afterReload = page.getByRole("switch", { name: /memor/i }).first()
    await expect(afterReload).toHaveAttribute("aria-checked", expected)
  })

  test("LLM backend select offers multiple backends", async ({ page }) => {
    await page.goto("/settings")
    await page.getByRole("combobox", { name: "LLM backend" }).click()
    const optionCount = await page.getByRole("option").count()
    expect(optionCount).toBeGreaterThanOrEqual(2)
  })
})
