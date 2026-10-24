# Venue photography

The original provider image was often only 420 pixels wide, and could be a logo. Rendering it across a desktop result card made the photograph visibly soft. The app now serves verified venue photographs from its own static deployment.

## Selection and rights

`scripts/photo-sources.json` is the reviewed mapping between stable Qloo venue IDs and individual Commons files. Matching uses exact IDs, including restored profiles; a similar name alone never substitutes a photograph. A library entry must depict that venue or a view explicitly photographed from it. Butler Library illustrates the Columbia library system, with that scope stated in its alternative text. Historical photographs illustrate locations, not current opening conditions or displays.

Each original is at least 2400 × 1600 pixels. Cropped editions retain the original photograph's CC BY, CC BY-SA or CC0 license; the app's MIT license covers code, not these assets. Attribution, source, license, original dimensions, output dimensions, and modifications are recorded in `src/data/venue-photos.json`. Visible captions accompany result, comparison, and map photographs; the Photography dialog credits the full library, including shortlist thumbnails. [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) and [Creative Commons attribution guidance](https://wiki.creativecommons.org/wiki/Recommended_practices_for_attribution) inform this record.

## Delivery

The maintainer-only `npm run photos:build` fetches source metadata and originals from Wikimedia, validates resolution and reuse licenses, applies reviewed 3:2 crops, and encodes WebP widths of 240, 480, 960, 1600, 2600 and 3200 pixels where the source supports them. A smaller original supplies the final width instead of being enlarged. The build retains completed unchanged editions, checkpoints new work, and respects source rate limits. `npm run photos:build -- --refresh` refetches unchanged entries. It never upscales or generates artificial detail. Filenames include a content hash; immutable CDN caching applies to image files. Deployment uses committed editions and needs no Wikimedia calls or photo API key.

The browser selects a responsive source using the card's role and viewport. Results load eagerly at high priority; secondary thumbnails and map details load lazily. Width/height metadata and fixed image frames keep layout stable. Selection remounts the image state for that exact asset, preventing an old venue photo from remaining after a change. Alternative text describes the actual view. Decorative shortlist thumbnails have empty alternative text beside the venue's visible name.

The library is intentionally finite. New or ambiguous venues retain their place in the Qloo shortlist and receive a clear placeholder until a matching photograph is verified. A generic skyline never masquerades as an unrelated restaurant. Image failure uses the same fallback. No paid service, generative-image inference, extra runtime subscription or billing integration is required.

## Verification

Asset tests decode every local edition, check its dimensions and metadata, validate attribution, forbid duplicate mappings or path traversal, and enforce per-file and total byte budgets. Browser tests cover actual responsive source selection at a 1920px viewport with 2× device density, comparison credits outside choice buttons, mobile layout, the photo dialog, and failure without showing the previous venue's image. Existing interaction, map-size, and accessibility regressions continue to run. Browser fixtures do not establish live Qloo availability; deployed checks are recorded separately.
