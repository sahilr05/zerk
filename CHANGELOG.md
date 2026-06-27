# Changelog

## [0.10.0] - 2026-06-27

### Added
- **MCP server (preview) - let your AI agent test your live API.** Run "Zerk: Enable MCP" and Zerk wires a Model Context Protocol server into your editor's agent (Windsurf, Cursor) or Claude Code. The agent can then fire authenticated requests against your running server and replay your saved test cases - with the auth token attached server-side and never exposed to the agent, and using your known-good payloads instead of guessing. Three tools: `fire_request`, `list_saved_cases`, `run_case`.

## [0.9.0] - 2026-06-27

### Added
- **Reload schema button** - a "↻ Reload schema" button in the request panel re-fetches the live spec for the open endpoint and re-renders params, body, and the expected-response schema in place. After you change a model and your server restarts, you no longer have to close and reopen the tab to see the new fields.

### Improved
- **Smoke test results are now a nested module tree** - results group into collapsible folders by module (and sub-module), each with a pass rollup, so large APIs are navigable instead of a long flat list.

### Removed
- **Go to Source** - removed. It was unreliable and tied the extension to a single framework; a more robust, framework-agnostic approach may return later.

## [0.8.1] - 2026-06-27

### Changed
- **Renamed to Zerk.** Same extension, same install - just a sharper name. A Zerk fitting is where a mechanic injects grease to kill friction; Zerk does that for the gap between writing and testing your API. All functionality is unchanged; command IDs and settings keys are untouched, so existing setups keep working.

## [0.8.0] - 2026-06-27

### Added
- **Run all cases (per endpoint)** - a "▶ Run all" button in the request panel fires every saved case for that endpoint in one click and shows an inline pass/fail list; each row expands to the full JSON response so you can verify the actual data.
- **Smoke test (module / whole surface)** - run all saved cases across a module (right-click a module → "Run all in module") or the entire API (the beaker icon in the sidebar toolbar). Choose what to include (uncased GETs, write methods) and confirm before any write requests fire.
- **Smoke test results panel** - a master-detail view: results grouped by endpoint with a pass rollup on the left, the selected case's actual response (status, time, highlighted JSON) on the right, plus a one-click "Open in request panel".

### Notes
- Write methods (POST/PUT/PATCH/DELETE) are excluded from smoke runs unless explicitly opted in, and always require a confirmation.

## [0.7.0] - 2026-06-27

### Added
- **Two-pane request panel** - inputs (path/query params, request body) on the left, expected and actual response on the right, so wide editor panels are actually used instead of a narrow column. Collapses to a single column when there are no inputs or the panel is narrow.
- **Method-colored tab icons** - request tabs now show the HTTP-method-colored icon (green GET, blue POST, …), making them scannable apart from code file tabs in the editor tab strip.

## [0.6.0] - 2026-06-26

### Added
- **Named test cases** - save your filled-in request body and parameters as a named input set per endpoint (e.g. "valid data", "missing field", "admin token"). Switch between them from a dropdown in the request panel. Stored in a committable `.api-explorer/cases.json` so they version with your code and share over git - and because only your inputs are saved (never the schema), they can't drift out of sync with the spec.
- **Form-urlencoded request bodies** - the request panel is now content-type aware. Endpoints that expect `application/x-www-form-urlencoded` (notably FastAPI's `OAuth2PasswordRequestForm` at `/auth/login`) now render and send correctly, with empty fields omitted.

### Fixed
- Login endpoints could not authenticate because the panel always sent JSON, producing stale-token `401`s on subsequent requests. Form logins now succeed and the auth token is captured automatically.

## [0.5.0] - 2026-04-11

### Fixed
- Source navigation rewritten; greps for FastAPI route decorators directly instead of parsing operationId, fixing false matches in pip internals and venv packages

## [0.4.1] - 2026-03-21

### Added
- N-level nested module grouping in sidebar - deep route structures like `/rfx/rfp/{id}` now group into `rfx → rfp → endpoints` automatically, no depth limit

### Improved  
- Explorer code split into focused files - `inferModule.ts`, `treeItems.ts`, `moduleTree.ts` for better maintainability

## [0.4.0] - 2026-03-21

### Added
- **Auth token auto-extract** - extension detects login endpoints and prompts to store token automatically
- **"🔑 Use as Auth" button** - appears on any response containing a token field, one click stores it
- Auth token restored automatically on VSCode restart
- Token expiry warning notification - alerts when JWT token expires with "Open Login" shortcut
- **Method badge icons** - colored SVG pill badges per HTTP method in the sidebar tree
- **5xx error highlight** - red error icon on endpoints that returned a server error, clears on next success
- **Filter & Sort combined** - single toolbar icon replaces 3 separate filter/sort icons
- **Collapsible Expected Response** - schema preview collapses automatically when real response arrives
- Response capped at 400px with scroll - no more infinite scroll panels
- History timestamps now show static time (e.g. `7:01 PM`) instead of relative "10s ago"
- Module prefix stripped in module-group tree view - `/module-a/create` shows as `/create`
- "Copy path" button on request panel header

### Fixed
- Auth badge now updates on all open panels simultaneously when config changes
- Config panel opens in correct editor pane
- History no longer shows stale relative timestamps

## [0.3.0] - 2026-03-19

### Added
- Auth badge + ⚙ Configure button visible on every request panel
- Auth badge updates live when config changes - no panel reload needed
- Auto-reconnect - polls silently when server is offline, connects automatically when server starts
- Friendly offline state in sidebar instead of error toast
- "↗ Open in Editor" button on response - opens in a real VSCode editor tab with full search, fold, and format support
- "⎘ Copy" button on response

### Fixed
- Config panel now opens in the correct pane
- Clicking same endpoint no longer opens a duplicate tab

## [0.2.1] - 2026-03-18

### Changed
- Updated README with screenshots and config panel documentation

## [0.2.0] - 2026-03-18

### Added
- Project Configuration panel (⚙ gear icon in sidebar)
- Auth support: Bearer Token, API Key, Basic Auth - set once, applied to all requests
- Default headers manager - set headers once per project, merged into every request
- Base URL now managed from the config panel (status bar still works too)
- Update notification - existing users informed when new features land

## [0.1.1] - 2026-03-15

### Fixed
- Duplicate API calls when switching endpoints in preview tab
- Default grouping now shows modules instead of methods

### Added
- Filter by module in the sidebar toolbar

## [0.1.0] - 2026-03-15

### Initial Release
- Zero-config OpenAPI endpoint discovery
- Request panel with pre-filled bodies resolved from `$ref` schemas
- Expected response schema preview
- Request history with full request/response persistence per workspace
- Group endpoints by method or module
- Filter by HTTP method, live search, sort toggle
- Per-project base URL via status bar
- Go to Source - jump from any endpoint to its Python route handler