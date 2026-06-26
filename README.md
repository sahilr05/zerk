# API Explorer

**Test your APIs without leaving VSCode.** API Explorer auto-discovers your FastAPI (and any OpenAPI-compliant) endpoints the moment your server starts - no collections to set up, no copy-pasting URLs, no switching to different app solely for API testing.

---

## Why API Explorer?

Every API testing tool makes you do the same thing: open the app, create a collection, manually add your routes, set up environments. It's friction you repeat on every project.

API Explorer eliminates that entirely. If your server is running and exposes an OpenAPI spec (FastAPI does this by default at `/openapi.json`), the extension picks it up automatically - all your endpoints appear in the sidebar, pre-filled with sample request bodies inferred from your actual schemas, ready to fire.

---

## Features

> **Preview release** - feedback welcome via [GitHub Issues](https://github.com/sahilr05/vscode-api-explorer/issues)

### Zero-config endpoint discovery

Point it at your server once. API Explorer fetches `/openapi.json`, parses every route, and populates the sidebar. No collection files, no manual entry.

The base URL is stored per-workspace - each project on your machine remembers its own server.

![Request panel showing POST /module-a/ with pre-filled request body and expected response schema](https://raw.githubusercontent.com/sahilr05/vscode-api-explorer/refs/heads/main/images/request-panel.png)

---

### Request bodies pre-filled from your schemas

API Explorer resolves `$ref` pointers in your OpenAPI spec and builds a sample body from your actual Pydantic models. Open a `POST` endpoint and the body is already there — correct field names, correct types.

The expected response schema is shown as a read-only preview below the request body, so you know what to expect before you even hit Send.

---

### Group by module or method

View your endpoints grouped by HTTP method, or switch to module view - which infers groupings from your URL structure automatically. `/auth/login`, `/auth/me` → `auth`. `/module-a/`, `/module-a/{item_id}` → `module-a`.

![Sidebar showing endpoints grouped by module: auth, module-a, module-b](https://raw.githubusercontent.com/sahilr05/vscode-api-explorer/refs/heads/main/images/module-grouping.png)

---

### Filter, search, sort

Filter by HTTP method or module using a single combined picker — uncheck to hide, check to show, apply everything at once. Live search by path or description. All from the sidebar toolbar.

![Filter & Sort picker showing method and module options](https://raw.githubusercontent.com/sahilr05/vscode-api-explorer/refs/heads/main/images/filter.png)
-----------------------------------------------------------------------------------------------------------------------------------------------------------

### Go to Source

Click any endpoint → jump directly to the route handler in your Python source. API Explorer reads the `operationId` from your spec, extracts the function name, and opens the exact file and line. No searching required.

Works automatically with FastAPI — no configuration needed.

![Source navigation jumping from /auth/login in the sidebar to the login function in router.py](https://raw.githubusercontent.com/sahilr05/vscode-api-explorer/refs/heads/main/images/source-nav.png)

---

### Request history

Every request you fire is saved to a per-project history with method, status code, elapsed time, and full request/response bodies. Click any history entry to reopen it with everything restored exactly as it was.

![Request panel with history showing multiple POST and GET requests](https://raw.githubusercontent.com/sahilr05/vscode-api-explorer/refs/heads/main/images/history.png)

---

### Named test cases — version them with your code

Fill in a request body and parameters, click **＋ Save current**, and name the input set — "valid data", "missing field", "admin token". Reopen the endpoint and pick any saved case from the dropdown to restore those exact inputs.

Cases are stored in a plain `.api-explorer/cases.json` file in your workspace, so you can **commit them to git and share them with your team** — no separate collection app, no account. And because only *your inputs* are saved (never the schema), they can't drift out of sync with your API the way a hand-maintained collection does. Your running server stays the single source of truth.

![Named cases](https://raw.githubusercontent.com/sahilr05/vscode-api-explorer/refs/heads/main/images/named-cases.png)

---

### Run all cases — smoke-test your API in one click

Once you've saved a few cases, fire them all at once. **▶ Run all** on an endpoint replays every saved case and shows an inline pass/fail list — expand any row to see the actual JSON it returned.

Need broader coverage? Right-click a module to run every case under it, or hit the **beaker icon** in the sidebar toolbar to smoke-test the whole API. Results land in a master-detail panel — endpoints grouped with a pass rollup on the left, the selected response on the right.

It's safe by default: only cases you explicitly saved are replayed, GET endpoints can be included automatically, and write methods (POST/PUT/PATCH/DELETE) stay out unless you opt in — with a confirmation before anything is modified. Because requests fire from the extension host against your live server, there's no setup and no CORS.

---

### Native VSCode feel

- Each endpoint opens in its own tab - click the same endpoint again to return to it
- Click "↗ Open in Editor" on any response to view it in a real VSCode editor tab - full search, folding, and formatting
- Auto-connects when your server starts - no manual refresh needed
- Requests fire from the extension host - no CORS issues ever
- Status bar shows connection state and endpoint count

---

### Project Configuration

One place to configure everything for your workspace — base URL, authentication, and default headers. Click the ⚙ icon in the sidebar toolbar to open it.

![Project configuration panel showing base URL, auth type selector, and default headers](https://raw.githubusercontent.com/sahilr05/vscode-api-explorer/refs/heads/main/images/project-config.png)

Set a Bearer token once and it's automatically attached to every request as `Authorization: Bearer ...`. Supports Bearer Token, API Key, and Basic Auth out of the box.

---

### Auth token auto-extract

Fire your login endpoint once — API Explorer detects the token in the response and asks if you want to use it. Click **Use as Auth** and it's stored securely and attached to every subsequent request automatically.

Works with any response containing `access_token`, `token`, or `jwt` fields. Supports JWT expiry detection — you'll get a warning notification when your token expires with a one-click shortcut back to your login endpoint.

---

## Getting Started

1. Install the extension
2. Open a project with a running FastAPI server
3. Click the API Explorer icon in the activity bar
4. Endpoints appear automatically — click any to open the request panel

**Default:** connects to `http://localhost:8000/openapi.json`

To change the URL, auth, or default headers: click the ⚙ icon in the sidebar toolbar to open the Project Configuration panel. Settings are saved per-workspace.

---

## Configuration


| Setting                  | Default                              | Description                                |
| -------------------------- | -------------------------------------- | -------------------------------------------- |
| `apiExplorer.openapiUrl` | `http://localhost:8000/openapi.json` | URL of the OpenAPI spec to load on startup |

---

## Built for FastAPI

API Explorer is built and optimized for FastAPI. Everything works out of the box — zero config, full `$ref` schema resolution, source navigation direct to your route handler, and content-type-aware request bodies (including `application/x-www-form-urlencoded` so `OAuth2PasswordRequestForm` logins like `/auth/login` just work).

Support for other OpenAPI-compatible frameworks is planned for a future release.

---

## Contributing

API Explorer is open source. Issues and PRs are welcome.

[GitHub →](https://github.com/sahilr05/vscode-api-explorer)

---

## License

MIT
