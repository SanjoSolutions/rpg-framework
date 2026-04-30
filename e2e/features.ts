import type { Page } from "@playwright/test"

export async function isFeatureEnabled(
  page: Page,
  featureSwitchName: RegExp,
): Promise<boolean> {
  await page.goto("/settings")
  return (await page.getByRole("switch", { name: featureSwitchName }).count()) > 0
}
