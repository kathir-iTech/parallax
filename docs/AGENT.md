# MCP agent tool

`parallax_advise` is a local stdio MCP bridge to the public PARALLAX HTTPS backend. It uses the same server decision engine as the studio. It is not a hosted stdio URL and contains no Qloo credential.

## Connect

```json
{
  "mcpServers": {
    "parallax": {
      "command": "npx",
      "args": [
        "--no-install",
        "tsx",
        "/absolute/path/to/parallax/agent/bridge.ts"
      ],
      "env": { "PARALLAX_URL": "https://parallax-culture.vercel.app" }
    }
  }
}
```

Install this repository's lockfile dependencies first. For a local backend use `http://127.0.0.1:4317`. A remote backend must use HTTPS. The backend session is bound to this running bridge process; do not transfer evidence handles to a fresh process and expect session scope to disappear.

## Tool actions

For an executable protocol demonstration after installing dependencies, run `npm run demo:agent`. It uses declared sample identities and a scripted first-option answer, checks that removing it restores the initial decision, and forgets temporary evidence. It performs real Qloo-backed MCP calls without invoking an LLM. It prints neither credentials nor signed identity proofs. Public-service and event limits apply.

1. `resolve`: `query` and `kind` (`artist`/`movie`). Ask the person to confirm the intended returned entity, keeping its signed `proof`.
2. `prepare`: two or three confirmed `references`, including proofs. Returns scoped, thirty-minute `evidence.id`, actual places and rankings, and initial decision.
3. `advise`: `evidenceId` and at most eight explicit `answers`. Answer schema: `id` UUID, `a` UUID, `b` UUID, `choice` in `a/b/both/neither/skip`.
4. `forget`: `evidenceId`. Deletes reachable temporary provider evidence for the current session. It does not erase old external-agent memory or exports.

`decision.status` is `clarify`, `recommend`, `exhausted`, or `insufficient`. For `clarify`, present the actual two places and ask what the person would rather try for this outing. Never manufacture a choice, imply a prior visit, or convert a skip into dislike. Propagate errors rather than replacing a live result with a recording.

The studio computes browser choices locally; the remote tool explicitly transmits supplied answers to its HTTPS backend for that operation. The backend does not persist them in a personal profile. A host LLM may have its own inference charges and memory policy; no host inference is bundled or required by PARALLAX.

## Verification labels

A real MCP protocol client can list and call this tool. That demonstrates transport and shared-engine integration, not a language-model-generated call. If a genuine model invocation is demonstrated separately, document the actual host, model, tool request, outcome, and cost basis. Do not relabel a scripted client as an autonomous model.
