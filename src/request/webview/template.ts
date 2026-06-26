/**
 * template.ts
 * Assembles the full HTML for the request panel webview.
 * Imports styles and clientScript separately for maintainability.
 */

import { ApiEndpoint } from "../../types/endpoint"
import {
    buildRequestBodyTemplate,
    buildResponseBodyTemplate,
    getRequestContentType,
} from "../../openapi/schemaResolver"
import { getStyles }       from "./styles"
import { getClientScript } from "./clientScript"
import { AuthConfig }      from "../../config/configManager"

const METHOD_COLORS: Record<string, string> = {
    GET:    "#10b981",
    POST:   "#3b82f6",
    PUT:    "#f59e0b",
    DELETE: "#f43f5e",
    PATCH:  "#a78bfa",
}

const AUTH_LABELS: Record<string, { label: string; color: string }> = {
    bearer: { label: "Bearer",    color: "#10b981" },
    apikey: { label: "API Key",   color: "#3b82f6" },
    basic:  { label: "Basic Auth", color: "#f59e0b" },
    none:   { label: "No Auth",   color: "rgba(204,204,204,0.3)" },
}

export interface RestoredState {
    requestBody?:  string
    responseBody?: string
    status?:       number
    statusText?:   string
    elapsed?:      number
}

export function renderPanel(
    endpoint: ApiEndpoint,
    baseUrl:  string,
    restored?: RestoredState,
    auth?: AuthConfig
): string {
    const color       = METHOD_COLORS[endpoint.method] ?? "#cccccc"
    const hasBody     = ["POST", "PUT", "PATCH"].includes(endpoint.method)
    const pathParams  = (endpoint.parameters ?? []).filter((p: any) => p.in === "path")
    const queryParams = (endpoint.parameters ?? []).filter((p: any) => p.in === "query")
    const components  = endpoint.components ?? {}

    const bodyContent = restored?.requestBody
        ?? (hasBody ? buildRequestBodyTemplate(endpoint.requestBody, components) : "")

    const contentType = (hasBody && getRequestContentType(endpoint.requestBody)) || "application/json"
    const isFormBody  = contentType.includes("form-urlencoded") || contentType.includes("form-data")

    const responseSchema = buildResponseBodyTemplate(endpoint.responses, components)

    const formattedPath = endpoint.path.replace(
        /\{([^}]+)\}/g,
        `<span style="color:rgba(204,204,204,0.35)">{$1}</span>`
    )

    // ── Auth badge ───────────────────────────────────────────────────────────
    const authType  = auth?.type ?? "none"
    const authStyle = AUTH_LABELS[authType] ?? AUTH_LABELS.none

    const authBadge = `
        <span id="authBadge" style="
            font-family:'JetBrains Mono','Fira Code',monospace;
            font-size:9px;font-weight:700;text-transform:uppercase;
            letter-spacing:.06em;padding:2px 6px;
            border:1px solid ${authStyle.color};
            color:${authStyle.color};
            flex-shrink:0;
        ">${authStyle.label}</span>`

    // ── Path params ──────────────────────────────────────────────────────────
    const pathParamsHtml = pathParams.length > 0 ? `
        <div class="section">
            <h3 class="section-title">Path Parameters</h3>
            <div class="param-list">
                ${pathParams.map((p: any) => `
                    <div class="param-row">
                        <label class="param-label">${p.name}${p.required ? ' <span class="required">*</span>' : ""}</label>
                        <input class="param-input" id="path_${p.name}" placeholder="${p.description || p.name}" data-param="${p.name}" />
                    </div>`).join("")}
            </div>
        </div>` : ""

    // ── Query params ─────────────────────────────────────────────────────────
    const queryParamsHtml = queryParams.length > 0 ? `
        <div class="section">
            <h3 class="section-title">Query Parameters</h3>
            <div class="param-list">
                ${queryParams.map((p: any) => `
                    <div class="param-row">
                        <label class="param-label">${p.name}${p.required ? ' <span class="required">*</span>' : ""}</label>
                        <input class="param-input" id="query_${p.name}" placeholder="${p.description || p.name}" data-query="${p.name}" />
                    </div>`).join("")}
            </div>
        </div>` : ""

    // ── Request body ─────────────────────────────────────────────────────────
    const bodyHtml = hasBody ? `
        <div class="section">
            <h3 class="section-title">Request Body${isFormBody
                ? ` <span style="font-weight:400;text-transform:none;letter-spacing:0;color:rgba(204,204,204,.35);font-size:10px">· sent as form (${contentType.replace("application/", "")}) — empty fields are omitted</span>`
                : ""}</h3>
            <textarea class="code-block" id="requestBody" style="height:140px;resize:vertical;width:100%">${bodyContent}</textarea>
        </div>` : ""

    // ── Expected response schema (read-only hint) ────────────────────────────
    const responseSchemaHtml = responseSchema ? `
        <div class="section" id="schemaSection">
            <h3 class="section-title" style="cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none" onclick="toggleSchema()">
                Expected Response
                <span id="schemaToggle" style="font-size:10px;color:rgba(204,204,204,.35);font-weight:400;text-transform:none;letter-spacing:0">▼ hide</span>
            </h3>
            <div id="schemaBody">
                <div class="schema-label">schema preview — read only</div>
                <div class="schema-preview">${responseSchema
                    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                }</div>
            </div>
        </div>` : ""

    // ── Restored response (from history) ────────────────────────────────────
    const restoredResponseHtml = (() => {
        if (!restored?.responseBody) return ""
        const status     = restored.status ?? 0
        const statusText = restored.statusText ?? ""
        const elapsed    = restored.elapsed ?? 0
        const cls        = status >= 500 ? "s5xx"
                         : status >= 400 ? "s4xx"
                         : status >= 300 ? "s3xx" : "s2xx"
        const escaped = restored.responseBody
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        return `
            <div class="response-meta">
                <span class="status-badge ${cls}">${status} ${statusText}</span>
                <span class="elapsed">${elapsed}ms</span>
                <span class="restored-tag">restored</span>
            </div>
            <div class="code-block response-pre" id="restoredResponse">${escaped}</div>`
    })()

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <title>${endpoint.method} ${endpoint.path}</title>
    <style>${getStyles(color)}</style>
</head>
<body>

<div class="scroll-area">
    <div class="inner">

        <div class="header">
            <span class="method-badge">${endpoint.method}</span>
            <span class="endpoint-path">${formattedPath}</span>
            <button class="copy-btn" id="copyBtn" onclick="copyPath()" title="Copy path"
                style="background:transparent;border:1px solid rgba(255,255,255,.12);cursor:pointer;color:rgba(204,204,204,.4);font-size:10px;font-family:inherit;padding:2px 8px;transition:all .1s;flex-shrink:0"
                onmouseover="this.style.color='#ccc';this.style.borderColor='rgba(255,255,255,.3)'"
                onmouseout="this.style.color='rgba(204,204,204,.4)';this.style.borderColor='rgba(255,255,255,.12)'">
                Copy path
            </button>
        </div>

        ${endpoint.summary ? `<div class="summary">${endpoint.summary}</div>` : ""}

        <div class="base-url-strip">
            <span class="base-url-tag">Base URL</span>
            <span class="base-url-value">${baseUrl}</span>
            ${authBadge}
            <button onclick="openConfig()" style="
                background:transparent;border:none;cursor:pointer;
                color:rgba(204,204,204,.35);font-size:11px;font-family:inherit;
                padding:0 4px;transition:color .1s;flex-shrink:0;white-space:nowrap;
            " onmouseover="this.style.color='rgba(204,204,204,.7)'"
               onmouseout="this.style.color='rgba(204,204,204,.35)'">
                ⚙ Configure
            </button>
        </div>

        <div class="cases-bar" id="casesBar">
            <span class="cases-tag">Cases</span>
            <select id="casesSelect" class="cases-select" onchange="loadCase()" title="Load a saved input set">
                <option value="">— saved cases —</option>
            </select>
            <button class="cases-btn" onclick="saveCase()" title="Save current inputs as a named case">＋ Save current</button>
            <button class="cases-btn cases-del" id="deleteCaseBtn" onclick="deleteCase()" style="display:none" title="Delete selected case">✕</button>
        </div>

        ${pathParamsHtml}
        ${queryParamsHtml}
        ${bodyHtml}
        ${responseSchemaHtml}

        <div class="section">
            <h3 class="section-title">Response</h3>
            <div id="responseArea">
                ${restoredResponseHtml || '<div class="placeholder">Hit Send to see the response</div>'}
            </div>
        </div>

    </div>
</div>

<div class="footer">
    <button class="send-btn" id="sendBtn" onclick="sendRequest()">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2l11 6-11 6V2z"/></svg>
        Send Request
    </button>
</div>

<script>${getClientScript(endpoint.path, endpoint.method, baseUrl, contentType)}</script>
</body>
</html>`
}