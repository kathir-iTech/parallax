# Experience and interaction verification

PARALLAX helps a person choose a New York place from familiar cultural references. Qloo supplies cross-domain associations; explicit comparison answers refine a finite preference model. The experience is organized around that decision.

## The journey

1. Choose two artists or films, optionally a third. Confirm the intended search identities.
2. Start discovery. The backend admits a balanced common pool of at most ten New York places, and obtains per-reference and combined-signal rankings.
3. Answer comparisons when their expected benefit clears the policy threshold. Up to three relative choices are allowed; a session may stop earlier. Both and skip do not create a relative preference. Neither vetoes the two places for this outing.
4. Inspect a leading choice and alternatives. The shortlist animates when candidates change position. “What changed?” compares the initial equal-emphasis model with the current decision; this is distinct from the provider's combined-signal baseline in the evidence view.
5. Open geographic context or the connections plot, inspect evidence, edit answers, save locally, or export field notes and preferences.

Answers update locally without further Qloo calls. Refreshing evidence or searching new references makes provider requests. Runtime operation does not require a generative model.

## Visual and motion behavior

The entry illustration is original SVG artwork rather than a stock venue photograph. Provider photographs remain separate, with honest loading and unavailable states. Primary reading copy is 16–20px; smaller supporting labels are used sparingly. Comparison cards have large click targets and factual descriptions.

Entry artwork has brief arrival animations. Discovery uses an indeterminate animation rather than an invented percentage. The comparison scene enters once per pair, and retained shortlist items move to their new positions. Settled results stay still. CSS animation, shortlist motion, scrolling, and map camera animation respect reduced-motion preferences.

The map library, styles, and worker load only when the explorer is first opened. Geographic rendering is released when the explorer closes or the connections plot opens. Camera state is retained and restored when returning. Ordinary selection and answer updates preserve the camera; recentering is an explicit action.

## Map repairs

The original selection effect removed and recreated every marker. The replacement keeps a registry by place ID, updates label and selection state in place, and removes a marker only when its place leaves the eligible set. Cleanup of all markers happens when the owning map is released.

Resize observations ignore zero or unchanged dimensions and coalesce updates to an animation frame. Listener, observer, frame, marker, and map lifecycles have explicit cleanup. Pixel density is capped at 2 to limit work on high-density screens. Style failures and WebGL context loss leave the place list and directions usable; retry and context restoration have dedicated paths.

The implementation fixes observed marker churn. It does not establish a universal cause for every reported freeze or a frame-rate guarantee on every device.

## Reproducible browser checks

`npm run test:browser` exercises the actual React application and MapLibre renderer. All backend API requests are intercepted with marked synthetic fixtures. The test map style has no remote tiles. Consequently this suite establishes interaction behavior, not live provider availability or tile-network performance.

The cases cover:

- Entry without eager map requests, mobile layout, and removal of unconfirmed draft text.
- A comparison that changes the leader, exact answer removal, field-note download, and labeled restoration after reload.
- Thirty selections without replacing unchanged marker elements, repeated dragging, zoom, resizes, view switches, and map close/reopen.
- Distinct both/neither behavior and reversible veto removal.
- Style failure with usable directions and candidate selection, retry, and actual WebGL context loss/restoration through the test browser's extension.
- Reduced-motion entry and recoverable discovery failure.

The browser uses headless Chromium with software WebGL in automated checks. This does not establish performance on the owner's physical GPU. Separate live checks must verify the deployed browser → API → Qloo → normalized evidence → decision → rendered result journey and the actual external map style. Their observed results belong in the release verification record.

## Operation boundaries

The established event API allowance, durable quota ledger, session limits, and free-service configuration remain in force. No paid animation package, image subscription, map API, runtime model, account system, or billing upgrade is introduced by the experience rebuild. Cultural association is not a guarantee of enjoyment or a certificate of current venue conditions.
