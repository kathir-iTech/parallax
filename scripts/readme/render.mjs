import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = new URL("../../", import.meta.url);
const frames = new URL("private/readme-frames/", root),
  assets = new URL("docs/assets/", root);
await mkdir(frames, { recursive: true });
await mkdir(assets, { recursive: true });
let html = await readFile(new URL("cover.html", import.meta.url), "utf8");
const dm = await readFile(
  new URL(
    "node_modules/@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff2",
    root,
  ),
);
const serif = await readFile(
  new URL(
    "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2",
    root,
  ),
);
html = html.replace(
  "<style>",
  `<style>@font-face{font-family:DM;src:url(data:font/woff2;base64,${dm.toString("base64")})}@font-face{font-family:Instrument;font-style:italic;src:url(data:font/woff2;base64,${serif.toString("base64")})}`,
);
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({
  executablePath: existsSync(chrome) ? chrome : undefined,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 560 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  for (let frame = 0; frame < 96; frame++) {
    await page.evaluate((t) => window.seekFrame(t), frame / 12);
    await page.screenshot({
      path: fileURLToPath(
        new URL(`${String(frame).padStart(3, "0")}.png`, frames),
      ),
    });
  }
  await page.evaluate(() => window.seekFrame(0));
  await writeFile(
    new URL("parallax-cover.png", assets),
    await page.screenshot(),
  );
} finally {
  await browser.close();
}
const result = spawnSync(
  process.env.PYTHON ?? "python",
  [
    fileURLToPath(new URL("assemble.py", import.meta.url)),
    fileURLToPath(frames),
    fileURLToPath(assets),
  ],
  { stdio: "inherit" },
);
if (result.status !== 0)
  throw new Error(
    "GIF assembly needs Python with Pillow. See docs/README_ASSETS.md.",
  );
