/**
 * core/executeRequest.ts
 * vscode-free request firing - the shared heart of the extension AND the MCP server.
 *
 * Pure: it does NOT prompt, write history, detect tokens, or touch any vscode/editor
 * state. The caller resolves the headers (auth + defaults) and passes them in, so the
 * exact same firing path serves the request panel, "Run all", and the headless MCP.
 */

import { ApiEndpoint }          from "../types/endpoint"
import { TestCase }             from "./types"
import { getRequestContentType } from "../openapi/schemaResolver"

export interface PreparedRequest {
    method:      string
    url:         string
    body?:       string
    contentType: string
}

export interface ExecResult {
    status:     number
    statusText: string
    elapsed:    number
    data:       any
}

/**
 * Assembles a concrete request from an endpoint + a saved case.
 * Mirrors the browser-side assembly in clientScript.ts, including the
 * JSON->form-urlencoded conversion (empty fields dropped) for form bodies.
 */
export function buildRequestFromCase(
    endpoint: ApiEndpoint,
    testCase: TestCase,
    baseUrl:  string
): PreparedRequest {

    const method = endpoint.method

    // Substitute path params
    let path = endpoint.path
    for (const [k, v] of Object.entries(testCase.pathParams ?? {})) {
        path = path.replace(`{${k}}`, encodeURIComponent(v))
    }

    // Build query string (skip empties)
    const qp = Object.entries(testCase.queryParams ?? {})
        .filter(([, v]) => v !== "" && v != null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)

    const url = baseUrl.replace(/\/$/, "") + path + (qp.length ? `?${qp.join("&")}` : "")

    const hasBody     = ["POST", "PUT", "PATCH"].includes(method)
    const contentType = (hasBody && getRequestContentType(endpoint.requestBody)) || "application/json"
    const isForm      = contentType.includes("form-urlencoded") || contentType.includes("form-data")

    let body: string | undefined
    if (hasBody && testCase.body) {
        if (isForm) {
            try {
                const obj    = JSON.parse(testCase.body || "{}")
                const params = new URLSearchParams()
                for (const [k, v] of Object.entries(obj)) {
                    if (v !== "" && v != null) params.append(k, String(v))
                }
                body = params.toString()
            } catch {
                body = testCase.body
            }
        } else {
            body = testCase.body
        }
    }

    return { method, url, body, contentType }
}

/**
 * Fires a prepared request with the given headers. The caller owns auth/defaults;
 * we only ensure the request's content type wins for the body we're actually sending.
 * Throws on network error.
 */
export async function executeRequest(
    req:     PreparedRequest,
    headers: Record<string, string>
): Promise<ExecResult> {

    // Content-Type last so a form body's type overrides a default of application/json.
    const finalHeaders: Record<string, string> = {
        ...headers,
        ...(req.body ? { "Content-Type": req.contentType } : {}),
    }

    const start    = Date.now()
    const response = await fetch(req.url, {
        method:  req.method,
        headers: finalHeaders,
        body:    req.body || undefined,
    })
    const elapsed = Date.now() - start
    const text    = await response.text()

    let data: any
    try   { data = JSON.parse(text) }
    catch { data = text }

    return { status: response.status, statusText: response.statusText, elapsed, data }
}
