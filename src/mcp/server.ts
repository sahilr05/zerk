#!/usr/bin/env node
/**
 * mcp/server.ts
 * Zerk MCP server. The thesis is "wrap STATE, not curl": it lets an AI agent
 * (Claude Code, Cursor, Windsurf, Claude Desktop) fire AUTHENTICATED requests
 * against the developer's running server and replay their tested saved cases -
 * without the agent ever seeing the auth token, and without it having to guess
 * request shapes. Runs as a plain Node process over stdio; imports only the
 * vscode-free src/core + src/openapi, so the exact same firing path serves the
 * extension and the agent.
 *
 * Config via env (written by the editor's mcp.json / `claude mcp add`):
 *   ZERK_BASE_URL    - base URL of the running server (default http://localhost:8000)
 *   ZERK_TOKEN       - bearer token to attach server-side (optional; Phase A)
 *   ZERK_PROJECT_DIR - dir holding .api-explorer/cases.json (default: cwd)
 */

import * as fs from "fs"
import { Server }                from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport }  from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"

import { OpenApiLoader }  from "../openapi/openApiLoader"
import { OpenApiParser }  from "../openapi/openApiParser"
import { ApiEndpoint }    from "../types/endpoint"
import { buildRequestFromCase, executeRequest, PreparedRequest, ExecResult } from "../core/executeRequest"
import { readAllCases, listCasesFor } from "../core/casesReader"

const BASE_URL    = (process.env.ZERK_BASE_URL || "http://localhost:8000").replace(/\/$/, "")
const TOKEN_FILE  = process.env.ZERK_TOKEN_FILE
const PROJECT_DIR = process.env.ZERK_PROJECT_DIR || process.cwd()

// Read the token fresh each call: the extension rewrites ZERK_TOKEN_FILE whenever
// you re-login, so the agent always uses a current token without a restart.
// Falls back to a static ZERK_TOKEN env if no file is configured.
function currentToken(): string | undefined {
    if (TOKEN_FILE) {
        try { return fs.readFileSync(TOKEN_FILE, "utf8").trim() || undefined } catch { return undefined }
    }
    return process.env.ZERK_TOKEN || undefined
}

// The token is attached here, server-side. It is never returned to the agent.
function authHeaders(): Record<string, string> {
    const token = currentToken()
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

// Lazily fetch + cache the parsed spec (needed only for replaying saved cases,
// which require the endpoint's content type to encode form bodies correctly).
let _endpoints: ApiEndpoint[] | null = null
async function getEndpoints(): Promise<ApiEndpoint[]> {
    if (!_endpoints) {
        const spec = await OpenApiLoader.fetchSpec(`${BASE_URL}/openapi.json`)
        _endpoints = OpenApiParser.parse(spec)
    }
    return _endpoints
}

function text(t: string, isError = false) {
    return { content: [{ type: "text", text: t }], isError }
}
function resultText(r: ExecResult) {
    const body = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2)
    return text(`${r.status} ${r.statusText} (${r.elapsed}ms)\n\n${body}`, r.status >= 400)
}

const TOOLS = [
    {
        name: "fire_request",
        description:
            "Fire an authenticated HTTP request against the developer's running server. " +
            "The auth token is attached server-side and is never exposed to you. " +
            "Use this to actually test an endpoint instead of guessing whether code works.",
        inputSchema: {
            type: "object",
            properties: {
                method: { type: "string", description: "GET, POST, PUT, PATCH, or DELETE" },
                path:   { type: "string", description: "Endpoint path, e.g. /rfx/rfi/ (substitute any {id} path params yourself)" },
                body:   { type: "string", description: "Optional request body as a JSON string" },
                query:  { type: "object", description: "Optional query parameters as a flat key/value object" },
            },
            required: ["method", "path"],
        },
    },
    {
        name: "list_saved_cases",
        description:
            "List the developer's saved test cases (known-good request payloads). " +
            "Prefer these over guessing a request shape. Optionally filter to one endpoint.",
        inputSchema: {
            type: "object",
            properties: {
                method: { type: "string", description: "Optional: filter to this HTTP method" },
                path:   { type: "string", description: "Optional: filter to this endpoint path" },
            },
        },
    },
    {
        name: "run_case",
        description:
            "Replay one of the developer's saved test cases against the running server, authenticated. " +
            "Returns the real response. Get names from list_saved_cases.",
        inputSchema: {
            type: "object",
            properties: {
                method:   { type: "string" },
                path:     { type: "string" },
                caseName: { type: "string", description: "The saved case name" },
            },
            required: ["method", "path", "caseName"],
        },
    },
]

const server = new Server({ name: "zerk", version: "1.0.0" }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name
    const args: any = request.params.arguments ?? {}

    try {
        if (name === "fire_request") {
            const method = String(args.method || "GET").toUpperCase()
            const rawPath = String(args.path || "/")
            const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`

            const qp = args.query && typeof args.query === "object"
                ? Object.entries(args.query)
                    .filter(([, v]) => v != null && v !== "")
                    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
                : []

            const url = BASE_URL + path + (qp.length ? `?${qp.join("&")}` : "")
            const prepared: PreparedRequest = {
                method,
                url,
                body:        args.body != null ? String(args.body) : undefined,
                contentType: "application/json",
            }
            return resultText(await executeRequest(prepared, authHeaders()))
        }

        if (name === "list_saved_cases") {
            const all = readAllCases(PROJECT_DIR)
            let entries = Object.entries(all)
            if (args.method && args.path) {
                const key = `${String(args.method).toUpperCase()}:${args.path}`
                entries = entries.filter(([k]) => k === key)
            }
            const out = entries.map(([endpoint, cases]) => ({
                endpoint,
                cases: cases.map(c => ({
                    name: c.name,
                    hasBody: !!c.body,
                    pathParams: c.pathParams ?? {},
                    queryParams: c.queryParams ?? {},
                })),
            }))
            return text(out.length ? JSON.stringify(out, null, 2) : "No saved cases found.")
        }

        if (name === "run_case") {
            const method = String(args.method || "").toUpperCase()
            const path   = String(args.path || "")
            const endpoint = (await getEndpoints()).find(e => e.method === method && e.path === path)
            if (!endpoint) return text(`No endpoint ${method} ${path} found in the running spec.`, true)

            const testCase = listCasesFor(PROJECT_DIR, `${method}:${path}`).find(c => c.name === args.caseName)
            if (!testCase) return text(`No saved case "${args.caseName}" for ${method} ${path}.`, true)

            const prepared = buildRequestFromCase(endpoint, testCase, BASE_URL)
            return resultText(await executeRequest(prepared, authHeaders()))
        }

        return text(`Unknown tool: ${name}`, true)
    } catch (err: any) {
        return text(`Error: ${err?.message ?? String(err)}`, true)
    }
})

async function main() {
    // stderr only - stdout is the JSON-RPC channel.
    console.error(`Zerk MCP ready. base=${BASE_URL} dir=${PROJECT_DIR} auth=${currentToken() ? "on" : "off"}`)
    await server.connect(new StdioServerTransport())
}

main().catch(err => {
    console.error("Zerk MCP fatal:", err)
    process.exit(1)
})
