/** Maintainer-only asset build. Deployment serves committed files without an API. */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import sharp from "sharp";
import sources from "./photo-sources.json" with { type: "json" };
import type { VenuePhoto } from "../src/photos.ts";

const widths = [240, 480, 960, 1600, 2600, 3200];
const output = new URL("../public/media/venues/", import.meta.url);
const catalogFile = new URL("../src/data/venue-photos.json", import.meta.url);
const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
const catalog = [];
await mkdir(output, { recursive: true });
const previous = JSON.parse(
  await readFile(catalogFile, "utf8").catch(() => "[]"),
) as (VenuePhoto & { buildSignature?: string })[];
async function fetchSource(url: URL, timeout: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        "User-Agent":
          "PARALLAX-PhotoBuilder/1.2 (https://github.com/kathir-iTech/parallax; maintainer asset preparation)",
      },
    });
    if (response.status !== 429 || attempt === 2) return response;
    const retry = response.headers.get("retry-after");
    const seconds =
      retry && /^\d+$/.test(retry)
        ? Number(retry)
        : retry
          ? Math.max(1, (Date.parse(retry) - Date.now()) / 1000)
          : 60;
    if (!Number.isFinite(seconds) || seconds > 180)
      throw new Error(
        `Source asks for a longer pause (${retry}); resume the asset build later.`,
      );
    await response.body?.cancel();
    console.log(
      `Source rate limit: respecting a ${Math.ceil(seconds)} second pause.`,
    );
    await new Promise((r) => setTimeout(r, Math.max(1, seconds) * 1000));
  }
  throw new Error("Source unavailable");
}
for (const source of sources) {
  const buildSignature = createHash("sha256")
    .update(JSON.stringify(source))
    .digest("hex");
  const existing = previous.find(
    (p) => p.placeId === source.placeId && p.buildSignature === buildSignature,
  );
  if (
    existing &&
    !process.argv.includes("--refresh") &&
    (
      await Promise.all(
        existing.variants.map(
          async (v) =>
            /^\/media\/venues\/[a-z0-9-]+\.webp$/.test(v.src) &&
            (
              await stat(new URL(`../public${v.src}`, import.meta.url)).catch(
                () => null,
              )
            )?.size === v.bytes,
        ),
      )
    ).every(Boolean)
  ) {
    catalog.push(existing);
    console.log(`${source.slug}: retained verified editions`);
    continue;
  }
  const query = new URL("https://commons.wikimedia.org/w/api.php");
  query.search = new URLSearchParams({
    action: "query",
    format: "json",
    titles: source.file,
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
  }).toString();
  const response = await fetchSource(query, 30000);
  if (!response.ok)
    throw new Error(`Metadata ${source.slug}: ${response.status}`);
  const data = await response.json();
  const page = Object.values(data.query.pages)[0] as {
    imageinfo: {
      url: string;
      descriptionurl: string;
      width: number;
      height: number;
      extmetadata: Record<string, { value: string }>;
    }[];
  };
  const info = page.imageinfo[0],
    meta = info.extmetadata;
  const license = meta.LicenseShortName?.value;
  if (!/^(CC BY(?:-SA)? [234]\.0|CC0|Public domain)$/.test(license))
    throw new Error(`License needs review: ${source.slug}: ${license}`);
  const original = new URL(info.url);
  if (
    original.hostname !== "upload.wikimedia.org" ||
    original.protocol !== "https:"
  )
    throw new Error("Unexpected image origin");
  // Strip the API's campaign parameters; all copies are served from our own CDN.
  original.search = "";
  const download = await fetchSource(original, 60000);
  if (!download.ok)
    throw new Error(`Download ${source.slug}: ${download.status}`);
  const buffer = Buffer.from(await download.arrayBuffer());
  const dimensions = await sharp(buffer).metadata();
  if (
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width < 2400 ||
    dimensions.height < 1600
  )
    throw new Error(`Insufficient source resolution: ${source.slug}`);
  const editions = [];
  for (const width of new Set([
    ...widths.filter((w) => w <= dimensions.width!),
    Math.min(3200, dimensions.width),
  ])) {
    // Visually reviewed 3:2 crops, not artificial detail generation or upscaling.
    const result = await sharp(buffer)
      .rotate()
      .resize(width, Math.round((width * 2) / 3), {
        fit: "cover",
        position: source.crop,
        withoutEnlargement: true,
      })
      .webp({ quality: 86, effort: 6 })
      .toBuffer({ resolveWithObject: true });
    editions.push(result);
  }
  // Hash actual encoded editions: a changed crop or encoder must change URLs.
  const digest = createHash("sha256");
  for (const edition of editions) digest.update(edition.data);
  const asset = `${source.slug}-${digest.digest("hex").slice(0, 12)}`;
  const variants = [];
  for (const result of editions) {
    const filename = `${asset}-${result.info.width}.webp`;
    await writeFile(new URL(filename, output), result.data);
    variants.push({
      src: `/media/venues/${filename}`,
      width: result.info.width,
      height: result.info.height,
      bytes: result.data.length,
    });
  }
  catalog.push({
    placeId: source.placeId,
    venue: source.venue,
    asset,
    title: strip(meta.ObjectName?.value ?? source.file.replace(/^File:/, "")),
    alt: source.alt,
    author: strip(meta.Artist?.value ?? "").replace(/ from .+$/, ""),
    source: info.descriptionurl,
    original: original.href,
    originalWidth: dimensions.width,
    originalHeight: dimensions.height,
    license,
    licenseUrl:
      meta.LicenseUrl?.value ??
      "https://creativecommons.org/publicdomain/zero/1.0/",
    changes:
      "Resized, cropped to 3:2, converted to WebP; metadata stripped. No generated detail.",
    position: source.position,
    sourceFile: source.file,
    buildSignature,
    variants,
  });
  if (!catalog.at(-1)?.author)
    throw new Error(`Missing author: ${source.slug}`);
  await writeFile(catalogFile, JSON.stringify(catalog, null, 2) + "\n");
  console.log(
    `${source.slug}: ${dimensions.width}×${dimensions.height}, ${variants.length} sizes, ${license}`,
  );
  await new Promise((r) => setTimeout(r, 2200));
}
await writeFile(catalogFile, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Built ${catalog.length} verified venue photographs.`);
