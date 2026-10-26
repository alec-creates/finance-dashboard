import { expect, test, type Page } from "@playwright/test";

import { TEST_PASSWORD } from "../tests/support/test-owner";
import { totpCode } from "../tests/support/totp";

/** Every main section and its page heading (keep in sync with src/components/app-shell/nav-items.ts). */
const SECTIONS = [
  { path: "/", label: "Overview" },
  { path: "/transactions", label: "Transactions" },
  { path: "/budgets", label: "Budgets" },
  { path: "/accounts", label: "Accounts" },
  { path: "/settings", label: "Settings" },
] as const;

test.describe.configure({ mode: "serial" });

test("signed-out visitors are sent to sign-in, and APIs refuse them", async ({
  page,
  request,
}) => {
  for (const { path } of SECTIONS) {
    await page.goto(path);
    await expect(page, `${path} should redirect`).toHaveURL(/\/sign-in$/);
  }
  const api = await request.get("/api/accounts");
  expect(api.status()).toBe(401);
});

test("sign-in pages carry the security headers and the app can be installed", async ({
  request,
}) => {
  const response = await request.get("/sign-in");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();

  // The manifest and icons load without a session, so the app can be installed before signing in.
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const body = (await manifest.json()) as { icons: { src: string }[] };
  for (const icon of body.icons) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
});

async function signIn(page: Page) {
  const email = process.env.E2E_OWNER_EMAIL;
  const secret = process.env.E2E_TOTP_SECRET;
  if (!email || !secret) {
    throw new Error("The global setup did not create the test owner");
  }
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/two-factor$/);
  await page.getByLabel(/6-digit code/).fill(totpCode(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("the owner signs in with 2FA, opens every section and signs out", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible();

  for (const { path, label } of SECTIONS) {
    // Phones use the bottom tab bar, desktops the sidebar: whichever navigation is visible.
    await page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true })
      .getByRole("link", { name: label })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`${path === "/" ? "/$" : `${path}$`}`),
    );
    await expect(
      page.getByRole("heading", { level: 1, name: label }),
    ).toBeVisible();
  }

  const accountMenu =
    testInfo.project.name === "phone"
      ? page.getByRole("button", { name: /Account menu/ })
      : page.locator("aside").getByRole("button").filter({ hasText: "@" });
  await accountMenu.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // The session is gone: app pages redirect again.
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/sign-in$/);
});
