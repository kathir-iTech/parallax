# PARALLAX

**Find a place through the things you love.**

[Open the studio](https://parallax-culture.vercel.app) · [Connect an agent](docs/AGENT.md) · [Inspect the methodology](docs/METHODOLOGY.md)

PARALLAX is a Qloo-powered place-choice studio and agentic tool. Start with two or three familiar artists or films. Qloo discovers New York places and ranks one shared shortlist through each cultural reference. When those perspectives disagree, a small exact decision model chooses a comparison that could change the recommendation.

The person answers what they would rather try. Up to three relative choices refine the shortlist. They can also skip, accept both, veto neither-for-this-outing options, change an answer, remove it, and rebuild the decision. The experience puts large comparison cards and a visibly changing shortlist first. Open the city map or cultural-connections plot when geographic context or ranking evidence helps.

The experience rebuild adds original animated vector artwork, readable typography, explicit discovery/comparison/result stages, before-and-after ranking, reduced motion, and an on-demand map. Unchanged places retain their marker objects during selection; camera position survives view switches. See [experience and browser verification](docs/EXPERIENCE.md).

Venue photography uses verified high-resolution originals and responsive WebP editions hosted with the app. Photo captions and the Photography dialog retain individual source and license credit. Unknown venues receive a clear placeholder without changing Qloo's shortlist. See [photography delivery and rights](docs/PHOTOGRAPHY.md).

## Run

Node 24.x; use the committed npm lockfile.

```sh
npm ci
cp .env.example .env.local
# Set QLOO_API_KEY, SESSION_SECRET (32+ characters), DATABASE_URL privately.
# Apply server/migration.sql to a dedicated Postgres database.
npm run dev
```

Open the printed local URL. No API keys are placed in browser configuration. `QLOO_KEY_FILE` can point to a private local file instead of embedding the credential in `.env.local`.

```sh
npm run test
npm run evaluate
npm run build
npm run mcp
```

For browser regression tests, install Playwright's Chromium once, then run:

```sh
npx playwright install chromium
npm run test:browser
```

These browser tests intercept every API request with explicitly synthetic fixtures, and use a deterministic map style with the real MapLibre renderer. They require no Qloo key, database, provider credits, or paid service. Windows can use an existing standard Chrome installation; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can override the executable. For diagnostic traces, run `npm run test:browser -- --trace on`.

## Architecture

| Layer                              | Responsibility                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| React / Vite studio                | Identity confirmation, mapped results, pairwise choices, local state, correction, export/import    |
| `core/`                            | Pure TypeScript finite preference model, modeled regret, exact comparison selection, stop rules    |
| `server/qloo.ts`                   | Direct Qloo API adapter, actual typed identities, bounded discovery and supplied-shortlist ranking |
| `server/handler.ts`                | Signed sessions and reference proofs, admission, scoped evidence handles, errors                   |
| Postgres ledger                    | Atomic shared quota reservation, short leases, thirty-minute normalized provider evidence          |
| `agent/bridge.ts`                  | One MCP stdio tool over the same public HTTPS API and decision engine                              |
| `tests/` and `scripts/evaluate.ts` | Independent oracle checks, failure boundaries, reproducible synthetic comparisons                  |

This is a direct API adapter based on the official Qloo workflow contracts. It does not execute or claim to be the native Qloo harness. Supplied-shortlist ranking is capped at ten identities. No mandatory runtime LLM, model subscription, paid map API, user account, or personal profile server is needed.

## Decision model

Within the common covered set, transform each cultural ranking into an ordinal feature `(m - 1 - position)/(m - 1)`. This application-defined utility surrogate is not a Qloo probability. A uniform finite prior spans weights on a 0.1 simplex grid: 11 hypotheses for two references; 66 for three. A logistic A/B likelihood with noise 0.18 updates hypothesis weights exactly.

The next pair maximizes expected reduction in modeled decision regret. A declared interaction threshold of 0.002, a three-relative-answer cap, two consecutive skips, and an eight-interaction safety cap can stop questioning. Both/skip do not fabricate relative preference; neither vetoes both in the current context. Model state is always recomputed from retained answers.

See [methodology](docs/METHODOLOGY.md), [agent integration](docs/AGENT.md), and [evaluation](docs/evaluation/SYNTHETIC.md).

## Evidence and limitations

Qloo cultural association is meaningful input to this application, but does not certify enjoyment or current venue conditions. Verify entry, opening, accessibility, prices, and availability directly. The first edition admits places in a bounded New York area, rejects known closed places and missing coordinates, and requires at least six places ranked under every cultural lens. Missing results are not dislikes.

Synthetic stress experiments and a real provider integration check are different evidence classes. Neither is an independent human study, a winning guarantee, or a reliability percentage. Familiarity, small candidate pools, linear ordinal utilities, and response noise remain limitations.

## Privacy, cost and licensing

Answers and an explicit balance when set stay in browser-managed local storage for the studio. The agent tool explicitly sends supplied answers for transient backend computation; it does not create a remote personal profile. Thirty-minute provider-evidence handles are session scoped. Preference exports contain references, answers, and optional explicit balance, not API keys, provider images, descriptions, or a claim of fresh evidence. See [privacy and operation](docs/OPERATIONS.md).

The source is MIT licensed. Third-party fonts, map software, map data and Qloo content retain their own licenses and terms; the MIT license does not relicense provider data. See [attribution](docs/ATTRIBUTION.md).
