import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { advise } from "../core/engine.ts";
import type { Evidence } from "../core/types.ts";
const require = createRequire(import.meta.url);

// Deliberately synthetic. No provider data, credentials, or live Qloo traffic.
function fixture(): Evidence {
  const ids = Array.from(
    { length: 8 },
    (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
  return {
    schema: 1,
    id: "00000000-0000-4000-9000-000000000001",
    area: "nyc",
    retrievedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
    references: [
      {
        id: "00000000-0000-4000-9000-000000000002",
        name: "Radiohead",
        kind: "artist",
        proof: "browser-fixture-only",
      },
      {
        id: "00000000-0000-4000-9000-000000000003",
        name: "The Grand Budapest Hotel",
        kind: "movie",
        proof: "browser-fixture-only",
      },
    ],
    places: ids.map((id, i) => ({
      id,
      name: `Test place ${i + 1}`,
      description:
        "Synthetic browser-test fixture. This is not a Qloo venue description.",
      category: "Test fixture",
      address: "Synthetic address, New York",
      lat: 40.715 + i * 0.014,
      lon: -74.01 + (i % 3) * 0.025,
    })),
    ranks: [ids, [...ids].reverse()],
    directOrder: ids,
    coverage: {
      discovered: 8,
      admitted: 8,
      common: 8,
      missing: 0,
      excluded: 0,
    },
    source: "live-qloo",
    workflow: "direct-api/insights-v2",
  };
}

async function setup(page: Page) {
  const evidence = fixture();
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const name = new URL(route.request().url()).pathname;
    requests.push(name);
    const body = route.request().postDataJSON();
    const result = name.endsWith("/session")
      ? { token: "browser-test-only" }
      : name.endsWith("/resolve")
        ? {
            references: evidence.references.filter((r) => r.kind === body.kind),
          }
        : name.endsWith("/prepare")
          ? { evidence, decision: advise(evidence, []) }
          : { removed: true };
    await route.fulfill({ json: result });
  });
  // Exercise real MapLibre camera/marker behavior with a deterministic local style.
  // Live-provider QA separately checks the real external tile style.
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#e7ebdf" },
          },
        ],
      },
    }),
  );
  await page.goto("/");
  return { evidence, requests };
}
async function discover(page: Page) {
  await page.getByRole("button", { name: /Radiohead.*Grand Budapest/ }).click();
  await expect(
    page.getByRole("button", { name: "Find my places", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Find my places", exact: true })
    .click();
  await expect(page.locator(".comparison-option")).toHaveCount(2);
}
async function openMap(page: Page) {
  await page.locator(".map-launch").click();
  await expect(page.locator('.real-map[data-map-state="ready"]')).toBeVisible();
  await expect(page.locator(".place-marker")).toHaveCount(8);
  await page.waitForTimeout(750); // Initial camera animation must settle before assertions.
}
const center = (page: Page) =>
  page.locator(".real-map").getAttribute("data-map-center");

test("readable entry, no eager map, mobile fit and complete data removal", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  await setup(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Go somewhere",
  );
  expect(requested.some((url) => /maplibre|openfreemap/.test(url))).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("textbox", { name: "Search music artist 1" })
    .fill("Draft to erase");
  await page.getByRole("button", { name: "How it works & privacy" }).click();
  await page
    .getByRole("button", { name: "Remove app data", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search music artist 1" }),
  ).toHaveValue("");
});

test("a comparison changes the order, undo rebuilds it, export and restore work", async ({
  page,
}) => {
  test.setTimeout(150000);
  const { requests } = await setup(page);
  await discover(page);
  const original = await page
    .locator(".shortlist-card strong")
    .allTextContents();
  await page.locator(".comparison-option").nth(1).click();
  await expect(page.locator(".shortlist-card strong").first()).not.toHaveText(
    original[0],
  );
  await page.getByRole("button", { name: "Edit choices", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Remove comparison 1" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".shortlist-card strong")).toHaveText(original);
  await page
    .getByRole("button", { name: "Adjust your cultural balance" })
    .click();
  const slider = page.locator("input[type=range]").first();
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  const explicitWeight = await slider.inputValue();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await expect(
    page
      .locator(".result-eyebrow")
      .filter({ hasText: "Restored observations" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Adjust your cultural balance" })
    .click();
  await expect(page.locator("input[type=range]").first()).toHaveValue(
    explicitWeight,
  );
  await page
    .getByRole("button", { name: "Return to my answers", exact: true })
    .click();
  await expect(page.locator(".shortlist-card strong")).toHaveText(original);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Field notes", exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe(
    "parallax-field-notes.md",
  );
  await page.reload();
  await expect(
    page
      .locator(".result-eyebrow")
      .filter({ hasText: "Restored observations" }),
  ).toBeVisible();
  expect(requests.filter((p) => p === "/api/prepare")).toHaveLength(1);
});

test("30 selections preserve marker identity; pan, zoom, resize and view switches preserve control", async ({
  page,
}) => {
  test.setTimeout(180000);
  await setup(page);
  await discover(page);
  await openMap(page);
  await page.evaluate(() => {
    (window as any).__originalMarkers = new Map(
      [...document.querySelectorAll<HTMLElement>(".place-marker")].map((e) => [
        e.dataset.placeId,
        e,
      ]),
    );
  });
  for (let i = 0; i < 30; i++)
    await page
      .locator(".all-places button")
      .nth(i % 8)
      .click();
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".place-marker")].every(
        (e) => (window as any).__originalMarkers.get(e.dataset.placeId) === e,
      ),
    ),
  ).toBe(true);
  await page.locator("#place-explorer").scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    document
      .getElementById("place-explorer")
      ?.scrollIntoView({ behavior: "instant", block: "start" }),
  );
  for (let i = 0; i < 4; i++) {
    const before = await center(page),
      box = (await page.locator(".real-map").boundingBox())!;
    const start = await page.evaluate(({ x, y, width, height }) => {
      for (const fx of [0.25, 0.45, 0.65])
        for (const fy of [0.35, 0.55]) {
          const px = x + width * fx,
            py = y + height * fy;
          if (
            document
              .elementFromPoint(px, py)
              ?.classList.contains("maplibregl-canvas")
          )
            return { x: px, y: py };
        }
      return null;
    }, box);
    expect(start).not.toBeNull();
    await page.mouse.move(start!.x, start!.y);
    await page.mouse.down();
    await page.mouse.move(start!.x + (i % 2 ? -80 : 100), start!.y + 35, {
      steps: 12,
    });
    await page.mouse.up();
    await expect.poll(() => center(page)).not.toBe(before);
    await page.waitForTimeout(500);
    const panned = await center(page);
    await page.locator(".all-places button").nth(i).click();
    expect(await center(page)).toBe(panned);
  }
  const zoom = Number(
    await page.locator(".real-map").getAttribute("data-map-zoom"),
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.locator(".real-map").getAttribute("data-map-zoom")),
    )
    .toBeGreaterThan(zoom);
  await page.waitForTimeout(350);
  const saved = await center(page);
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "City map", exact: true }).click();
    await expect(
      page.locator('.real-map[data-map-state="ready"]'),
    ).toBeVisible();
    const current = (await center(page))!.split(",").map(Number),
      initial = saved!.split(",").map(Number);
    current.forEach((value, index) =>
      expect(value).toBeCloseTo(initial[index], 7),
    );
  }
  for (const width of [390, 1440, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".real-map")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Back to your places", exact: true })
    .click();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  await page.locator(".map-launch").click();
  await expect(page.locator('.real-map[data-map-state="ready"]')).toBeVisible();
});

test("both and neither remain distinct, and veto removal restores the shortlist", async ({
  page,
}) => {
  await setup(page);
  await discover(page);
  const original = await page
    .locator(".shortlist-card strong")
    .allTextContents();
  await page
    .getByRole("button", { name: "Both look good", exact: true })
    .click();
  await expect(page.locator(".shortlist-card strong")).toHaveText(original);
  await expect(page.locator(".decision-change")).toContainText(
    "No relative preference inferred",
  );
  await page.getByRole("button", { name: "Neither", exact: true }).click();
  await page.getByRole("button", { name: "Edit choices", exact: true }).click();
  await page.getByRole("button", { name: "Remove comparison 2" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".shortlist-card strong")).toHaveText(original);
});

test("map failure leaves directions and candidates usable; retry recovers", async ({
  page,
}) => {
  await setup(page);
  await discover(page);
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.abort("failed"),
  );
  await page.locator(".map-launch").click();
  await expect(
    page.getByText("The map is unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Get directions", exact: true }),
  ).toBeVisible();
  await page
    .locator(".all-places button")
    .filter({ hasText: "Test place 3" })
    .click();
  await expect(page.locator(".map-place-details h2")).toHaveText(
    "Test place 3",
  );
  await page.unroute("https://tiles.openfreemap.org/styles/positron");
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background" }],
      },
    }),
  );
  await page.getByRole("button", { name: "Retry map", exact: true }).click();
  await expect(page.locator('.real-map[data-map-state="ready"]')).toBeVisible();
  const contextLossSupported = await page.evaluate(() => {
    const canvas =
      document.querySelector<HTMLCanvasElement>(".maplibregl-canvas")!;
    const gl = canvas.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    (window as any).__restoreMapContext = () => extension.restoreContext();
    extension.loseContext();
    return true;
  });
  expect(contextLossSupported).toBe(true);
  await expect(
    page.getByText("The map is unavailable.", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as any).__restoreMapContext());
  await expect(page.locator('.real-map[data-map-state="ready"]')).toBeVisible();
});

test("reduced motion and failed discovery retain readable usable controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  expect(
    await page
      .locator(".art-sun")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page.route("**/api/prepare", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Synthetic provider failure for this browser test.",
        },
      },
    }),
  );
  await page.getByRole("button", { name: /Radiohead.*Grand Budapest/ }).click();
  await page
    .getByRole("button", { name: "Find my places", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic provider failure",
  );
  await expect(
    page.getByRole("button", { name: "Find my places", exact: true }),
  ).toBeEnabled();
});

test("text retains accessible contrast midway through scene and dialog animations", async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.addEventListener("animationstart", (event) => {
      if (!(event.target instanceof Element)) return;
      for (const animation of event.target.getAnimations()) {
        const timing = animation.effect?.getTiming();
        if (
          timing &&
          timing.iterations !== Infinity &&
          typeof timing.duration === "number"
        ) {
          animation.pause();
          animation.currentTime = timing.duration / 2;
        }
      }
    });
  });
  await setup(page);
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  async function checkContrast() {
    const violations = await page.evaluate(async () => {
      const axe = (window as any).axe as typeof import("axe-core");
      const result = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      }));
    });
    expect(violations).toEqual([]);
  }
  await page.getByRole("button", { name: "For agents", exact: false }).click();
  await checkContrast();
  await page.keyboard.press("Escape");
  await discover(page);
  await checkContrast();
  await page
    .getByRole("button", { name: "See my places", exact: true })
    .click();
  await checkContrast();
});
