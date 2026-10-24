# README assets

The header is an original workflow illustration, not a screen recording or a claim that a provider result is being generated. The animated GIF is pre-rendered and hosted in this repository; it needs no third-party animation service or JavaScript on GitHub. A still PNG is available, including through the reduced-motion picture source.

To regenerate it, install the repository's npm dependencies and a Playwright Chromium browser. The optional maintainer encoder uses Python with Pillow; the app and normal build do not need Python.

```sh
python -m pip install Pillow
npm run readme:assets
```

The renderer uses bundled open-license typefaces. Intermediate frames go to ignored `private/readme-frames/`. Committed assets are under `docs/assets/`, excluded from deployment uploads. A fixed palette keeps the animation stable. The header does not use external counters or fabricated measurements.

`studio.webp` is a resized screenshot of the real v1.2.0 studio using explicitly restored Qloo observations. Its Top of the Rock photograph is by Domenico Convertini, [source](<https://commons.wikimedia.org/wiki/File:Sunset_from_Top_of_The_Rock,_Rockefeller_Center_(51197172512).jpg>), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). The preview is resized and distributed under CC BY-SA 2.0; the underlying interface source remains MIT. The original header illustration and its animation are MIT licensed.
