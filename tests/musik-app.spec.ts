import { test, expect } from "@playwright/test";

test.describe("Musikrum — Public Routes", () => {
  test("Landing page loads with Spotify login button", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Musikrum/i);
    const btn = page.getByRole("button", { name: /logga in med spotify/i });
    await expect(btn).toBeVisible();
  });

  test("/app redirects to landing when not authenticated", async ({ page }) => {
    await page.goto("/app");
    // Middleware redirects unauthenticated users to /
    await expect(page).toHaveURL("/");
  });

  test("/onboarding is not directly accessible without auth", async ({ page }) => {
    // Onboarding is behind middleware matcher — unauthenticated → redirect to /
    await page.goto("/onboarding");
    await expect(page).toHaveURL("/");
  });

  test("PWA manifest is served at /manifest.json", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Musikrum");
    expect(body.icons.length).toBeGreaterThan(0);
  });

  test("No 500 errors on public routes", async ({ request }) => {
    const routes = ["/", "/manifest.json", "/icon.svg"];
    for (const route of routes) {
      const res = await request.get(route);
      expect(res.status(), `${route} returned ${res.status()}`).toBeLessThan(500);
    }
  });
});
