# Driving the browser

- **`bunx playwright-cli`** only, headless, one command per action, always with your own session: `-s=<role>-<topic>` (e.g. `-s=explorer-coupon`). Never share a session with another agent.
- **Arrange first, then open** (`.claude/rules/test-data.md`). The start state comes from a framework recipe: `bun run qa:arrange <recipe> --name <session> [param=value …]` or `bun run qa:arrange --case TC-… --name <session>` — it starts ShopLite as `TEST_ENV` (default `dev`) if needed, creates the data over the API, saves the browser state, and prints the ids, test data and the commands to open it:
  ```
  bunx playwright-cli -s=<session> open http://localhost:3100
  bunx playwright-cli -s=<session> state-load out/sessions/<session>.json      # only when signed in
  bunx playwright-cli -s=<session> goto http://localhost:3100/#/<route>
  ```
  Routes: `#/`, `#/product/<id>`, `#/cart`, `#/checkout`, `#/orders`, `#/orders/<id>`, `#/login`, `#/register`.
- **Snapshot before acting**, act by ref, re-snapshot after. `find "<text>"` to locate text cheaply instead of piping a snapshot through grep. Read-only before mutating. One playwright-cli command per call.
- **Watch the network around every action:** `requests` after it; `response-body <n>` for the API's answer. The request that proves the action landed is what a page object must wait for.
- **Record exactly:** labels and messages verbatim (typos included), the observed result of every step, the request/response that backs it.
- **Locators for page objects:** `generate-locator <ref>` — prefer the role/label form it suggests.
- **Evidence:** `screenshot --filename=out/evidence/<session>-<step>.png` for anything that will be reported.
- **Close your session** (`-s=<session> close`) before you return — and before any stop.
- Every command has a 90 s cap; a step that needs longer is split.
