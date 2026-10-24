import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import catalog from "../src/data/venue-photos.json" with { type: "json" };
import { photoFor } from "../src/photos.ts";

test("photography ships real decodable responsive files with source, rights and size budgets", async () => {
  assert.ok(catalog.length >= 15);
  const ids = new Set<string>();
  let totalBytes = 0;
  for (const photo of catalog) {
    assert.ok(
      !ids.has(photo.placeId),
      `Duplicate photo identity ${photo.venue}`,
    );
    ids.add(photo.placeId);
    assert.ok(photo.author && photo.title && photo.alt && photo.changes);
    assert.equal(new URL(photo.source).hostname, "commons.wikimedia.org");
    assert.equal(new URL(photo.licenseUrl).hostname, "creativecommons.org");
    assert.ok(
      /^CC BY(?:-SA)? [234]\.0$|^CC0$|^Public domain$/.test(photo.license),
    );
    assert.ok(photo.originalWidth >= 2400 && photo.originalHeight >= 1600);
    assert.ok(photo.variants.length >= 5);
    assert.ok(photo.variants.at(-1)!.width >= 2400);
    let previous = 0;
    for (const variant of photo.variants) {
      assert.match(variant.src, /^\/media\/venues\/[a-z0-9-]+-\d+\.webp$/);
      assert.ok(
        variant.width > previous && variant.width <= photo.originalWidth,
      );
      previous = variant.width;
      const file = new URL(`../public${variant.src}`, import.meta.url);
      assert.equal((await stat(file)).size, variant.bytes);
      assert.ok(
        variant.bytes < 2500000,
        `${variant.src} exceeds its byte budget`,
      );
      if (variant.width <= 480) assert.ok(variant.bytes < 65000);
      const buffer = await readFile(file);
      const image = await sharp(buffer).metadata();
      assert.equal(image.format, "webp");
      assert.equal(image.width, variant.width);
      assert.equal(image.height, variant.height);
      assert.equal(image.exif, undefined);
      await sharp(buffer).stats(); // Full pixel decode, not just a readable header.
      totalBytes += variant.bytes;
    }
  }
  assert.ok(totalBytes < 60000000, "Committed photo library exceeds 60MB");
});

test("photographs match stable identity, including restored profiles, without name substitution", () => {
  const photo = catalog.find((p) => p.venue === "Empire State Building")!;
  assert.ok(photoFor({ id: photo.placeId.toLowerCase() }));
  assert.equal(photoFor({ id: "unverified-empire-state-building" }), undefined);
});
