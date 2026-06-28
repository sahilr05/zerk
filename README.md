# Zerk

**Test your API without leaving your editor.** Zerk auto-discovers your running server's endpoints from its OpenAPI spec, pre-fills request bodies from your real schemas, and lets you (or your AI agent) fire authenticated requests in one click. No collections to build, no setup, no copy-pasting URLs, no second app.

> **Preview release** - feedback and bug reports welcome via [GitHub Issues](https://github.com/sahilr05/zerk/issues)

<!--
Screenshots in /images, all wired below:
  hero, sidebar, request-panel, named-cases, smoke-test, mcp, config,
  history, module-grouping, filter
Note: history.png still uses generic /module-a/ paths (re-capture against rfx/rfi when convenient).
-->

![Zerk: the sidebar and an open request panel](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/hero.png)

---

## Why Zerk?

Every other API tool makes you repeat the same ritual on every project: open the app, create a collection, hand-add your routes, set up environments. Then your collection drifts out of sync with the code, because it's a second copy of your API that you maintain by hand.

Zerk skips all of it. If your server is running and exposes an OpenAPI spec (FastAPI does this by default at `/openapi.json`), every endpoint shows up in the sidebar, pre-filled with sample bodies from your actual models, ready to fire. Your running server stays the single source of truth, so nothing ever drifts.

And because Zerk holds your live spec and your auth, it can hand those to your AI agent too - so the agent can test the endpoint it just wrote, for real, without you pasting credentials into a chat.

---

## Features

### Zero-config endpoint discovery

Point it at your server once. Zerk fetches `/openapi.json`, parses every route, and fills the sidebar. No collection files, no manual entry. It auto-reconnects when your server starts, and the base URL is remembered per-workspace, so each project finds its own server.

![Endpoints auto-discovered and grouped by module](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/sidebar.png)

---

### A request panel that fills itself in

Open any endpoint and the request is already set up for you:

- **Bodies pre-filled from your schemas** - Zerk resolves `$ref` pointers and builds a sample body from your real models, with correct field names and types.
- **Expected response preview** - the success-response schema is shown read-only, so you know what you're getting before you hit Send (it auto-collapses once a real response arrives).
- **Two-pane layout** - inputs on the left, response on the right, so a wide editor is actually used.
- **Content-type aware** - JSON and `application/x-www-form-urlencoded`, so FastAPI's `OAuth2PasswordRequestForm` logins (`/auth/login`) just work.
- **↻ Reload schema** - changed a model and your server restarted? Reload the spec in place, no need to close and reopen the tab.
- **Method-colored tabs**, path/query param inputs, syntax-highlighted responses, status + timing, copy path, copy response, and "↗ Open in Editor" to view a response in a real editor tab.

![Two-pane request panel with pre-filled body and live response](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/request-panel.png)

---

### Named test cases - versioned with your code

Fill in a body and parameters, click **＋ Save current**, and name the input set: "valid data", "missing field", "admin token". Reopen the endpoint and pick any saved case to restore those exact inputs.

Cases live in a plain `.api-explorer/cases.json` file in your workspace, so you can **commit them to git and share them with your team** - no separate app, no account. Only *your inputs* are saved (never the schema), so they can't drift out of sync with your API the way a hand-maintained collection does.

![Saved cases on an endpoint](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/named-cases.png)

---

### Run all cases - smoke-test your API

Once you've saved a few cases, fire them all at once. **▶ Run all** on an endpoint replays every saved case and shows a pass/fail list; expand any row to see the actual JSON it returned.

Need broader coverage? Right-click a module to run everything under it, or hit the **beaker icon** in the toolbar to smoke-test the whole API. Results land in a panel with a **nested module tree** on the left (each folder with a pass rollup) and the selected response on the right.

Safe by default: only cases you explicitly saved are replayed, GET endpoints can be included automatically, and write methods (POST/PUT/PATCH/DELETE) stay out unless you opt in - with a confirmation before anything is modified. Requests fire from the extension host against your live server, so there's no CORS.

![Smoke-test results: nested module tree and selected response](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/smoke-test.png)

---

### Let your AI agent test your API *(preview)*

Run **"Zerk: Enable MCP"** from the command palette and Zerk wires a Model Context Protocol server into your editor's agent (Windsurf, Cursor) or Claude Code. Now your agent can test the API it just wrote, for real:

- **`fire_request`** - fires an authenticated request against your running server. The auth token is attached server-side and **never exposed to the agent**, so you never paste credentials into a chat.
- **`list_saved_cases`** - hands the agent your known-good payloads instead of letting it guess request shapes.
- **`run_case`** - replays one of your saved cases, authenticated, and returns the real response.

This isn't "AI that writes tests" - it's an agent that **executes against your live, authenticated server with your tested payloads**. Ask it to "add a POST endpoint and make sure it works," and it writes the code, fires it, reads the real `422`, fixes the schema, and re-fires - no context switch, no credentials in the chat.

![An agent calling Zerk's tools to hit the live API](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/mcp.png)

---

### Group, filter, search

Group endpoints by **module** (inferred from your URL structure, nested to any depth: `/rfx/rfp/{id}` becomes `rfx → rfp → ...`) or by **HTTP method**. Filter by method or module from a single combined picker, and live-search by path or description, all from the sidebar toolbar.

![Endpoints nested into module folders](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/module-grouping.png)

![Combined method and module filter picker](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/filter.png)

---

### Request history

Every request you fire is saved to a per-project history with method, status code, elapsed time, and full request/response bodies. Click any entry to reopen it with everything restored exactly as it was.

![Request history](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/history.png)

---

### Project configuration & auth

One place to configure everything for the workspace - base URL, authentication, and default headers - behind the ⚙ icon in the toolbar. Supports **Bearer Token, API Key, and Basic Auth**; set it once and it's attached to every request.

**Auth token auto-extract:** fire your login endpoint once and Zerk detects the token in the response and offers to use it. Click **Use as Auth** and it's stored securely and attached to every subsequent request. Works with any response containing `access_token`, `token`, or `jwt`, and warns you when a JWT expires with a one-click shortcut back to your login endpoint.

![Project configuration panel](https://raw.githubusercontent.com/sahilr05/zerk/refs/heads/main/images/config.png)

---

### Native editor feel

- Each endpoint opens in its own tab; click the same endpoint again to return to it.
- Auto-connects when your server starts - no manual refresh.
- Requests fire from the extension host - **no CORS, ever**.
- Status bar shows connection state and endpoint count.

---

## Getting Started

1. Install the extension (VS Code Marketplace, or Open VSX for Cursor / Windsurf / VSCodium).
2. Open a project with a running FastAPI (or any OpenAPI) server.
3. Click the **Zerk** icon in the activity bar.
4. Endpoints appear automatically - click any to open its request panel.

**Default:** connects to `http://localhost:8000/openapi.json`. Change the URL, auth, or headers from the ⚙ Project Configuration panel (saved per-workspace).

To let an AI agent test your API, run **"Zerk: Enable MCP"** from the command palette.

---

## Configuration

| Setting                  | Default                              | Description                                |
| ------------------------ | ------------------------------------ | ------------------------------------------ |
| `apiExplorer.openapiUrl` | `http://localhost:8000/openapi.json` | URL of the OpenAPI spec to load on startup |

---

## Built for FastAPI, works with any OpenAPI server

Zerk is built and tuned for FastAPI - zero config, full `$ref` schema resolution, and content-type-aware bodies (including `application/x-www-form-urlencoded`, so `OAuth2PasswordRequestForm` logins just work). Because it reads standard OpenAPI 3, it also works with any server that exposes a spec (NestJS, Spring, Litestar, Django-Ninja, and more). If your framework doesn't serve one, point Zerk at any OpenAPI URL.

---

## Like Zerk?

It's a one-person project and every bit of visibility helps:

- ⭐ **Star it on [GitHub](https://github.com/sahilr05/zerk)**
- ✍️ **Leave a review** on [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sahilrajpal.api-explorer&ssr=false#review-details) or [Windsurf](https://marketplace.windsurf.com/extension/sahilrajpal/api-explorer)
- 🐛 **Found a bug or have an idea?** Open a [GitHub Issue](https://github.com/sahilr05/zerk/issues)

---

## Contributing

Zerk is open source. Issues and PRs are welcome.

[GitHub →](https://github.com/sahilr05/zerk)

---

## License

MIT
