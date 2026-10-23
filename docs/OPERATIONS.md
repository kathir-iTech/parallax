# Operation, privacy and zero-cost controls

## Deployment

React/Vite static files and Node functions share a Vercel project. Server credentials are `QLOO_API_KEY`, `SESSION_SECRET`, and `DATABASE_URL`. None uses a browser-public `VITE_` prefix. A dedicated database must have `server/migration.sql` applied before any live provider request is admitted. An unavailable quota store fails closed; no production in-memory fallback exists.

Provision only an explicitly verified no-card Free database and eligible Vercel Hobby resources. Never enable auto upgrades, paid inference, domains, card-required trials, or paid fallback resources. Exhausted free allowances may pause functionality; the application does not buy its way around them.

## Shared quota policy

Before every outbound Qloo attempt, one atomic Postgres function checks and increments the provider month, day, second, anonymous session, and pseudonymous IP-day counters. Caps: 25,000/month, 800/day, 8/second, 24/session, 120/IP/day. These conservative application limits sit below the event credential headers observed during the initial integration check; they are not provider promises. Separate HTTP/session admission limits protect the backend. All attempted transmissions count conservatively. No automatic retry or paid fallback exists.

A transaction-level advisory lock makes multi-dimension reservations all-or-nothing across concurrent serverless instances. Preparation leases prevent overlapping preparations in the same session and expire after 150 seconds. Quota ledger failure blocks fresh provider calls and preserves locally computed decisions. A browser cancellation can leave a request already in progress; its stale result cannot overwrite a newer context.

## Data

- Studio references, answers, and explicit balance when set: IndexedDB on the user's device. No tracking analytics or account login.
- Server: signed anonymous session IDs, bounded counters, pseudonymous network identifiers, thirty-minute normalized provider evidence, and 150-second preparation leases. No personal answer database.
- IP pseudonyms: HMAC under a private server secret, used only for admission limits; raw request bodies and credentials are not logged by application code. Hosting/provider infrastructure has its own logs and terms.
- Qloo: selected cultural identities and bounded query parameters. No names/emails, imported URLs, or personal browsing history are required.
- Agent tool: supplied answers are transmitted for transient computation, as disclosed in the tool description.
- Export: preference identities, explicit answers, and optional explicit balance; optional readable field notes containing selected venue identities and links. No raw bulk responses, provider images, API keys, or identity proofs are embedded.

Managed local removal compacts state and removes derived decisions. It also attempts deletion of the reachable session-scoped temporary evidence handle; if unreachable, the UI states the expiry boundary. Earlier exports, screenshots, external-agent memories, provider logs, and backups are outside that action. Opportunistic database cleanup removes expired rows; expiry prevents access even before physical cleanup.

## Boundaries

New York is the only initial supported area. Coordinate bounds are an admission check, not a certified municipal boundary dataset. Venue metadata can be missing, outdated, or inaccurate; the UI asks people to verify current visiting conditions directly. Current credential expiry and longer-term data permissions must be confirmed from the organizer's grant, not inferred from quota headers. The source license does not grant general redistribution rights over Qloo data.
