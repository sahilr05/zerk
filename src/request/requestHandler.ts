/**
 * requestHandler.ts
 * Handles incoming messages from the webview, fires HTTP requests
 * from the extension host, and saves results to history.
 * Also detects auth tokens in responses and prompts user to store them.
 */

import * as vscode              from "vscode"
import { ApiEndpoint }          from "../types/endpoint"
import { ConfigManager }        from "../config/configManager"
import { HistoryManager }       from "../history/historyManager"
import { EndpointTreeProvider } from "../explorer/endpointTreeProvider"
import { AuthStore }            from "../auth/authStore"
import { CasesStore }           from "../cases/casesStore"
import { shouldPromptForToken } from "../auth/authDetector"
import { extractToken }         from "../auth/tokenExtractor"
import { executeRequest, buildRequestFromCase } from "./executeRequest"

export function attachRequestHandler(
    panel:           vscode.WebviewPanel,
    endpoint:        ApiEndpoint,
    config:          ConfigManager,
    history:         HistoryManager,
    treeProvider:    EndpointTreeProvider,
    authStore:       AuthStore,
    cases:           CasesStore,
    onMarkPermanent: () => void
): vscode.Disposable {

    const endpointKey = `${endpoint.method}:${endpoint.path}`

    const postCases = async () => {
        panel.webview.postMessage({
            type:      "casesList",
            available: cases.available,
            cases:     await cases.list(endpointKey),
        })
    }

    return panel.webview.onDidReceiveMessage(async (message) => {

        if (message.type === "markPermanent") {
            onMarkPermanent()
            return
        }

        // ── Named test cases (git-committable deltas) ─────────────────────────
        if (message.type === "listCases") {
            await postCases()
            return
        }

        if (message.type === "saveCase") {
            if (!cases.available) {
                vscode.window.showWarningMessage(
                    'Zerk: Open a folder to save test cases (they\'re stored in .api-explorer/cases.json).'
                )
                return
            }
            const name = await vscode.window.showInputBox({
                title:       `Save test case — ${endpoint.method} ${endpoint.path}`,
                prompt:      'Name this input set (e.g. "valid data", "missing field", "admin token")',
                placeHolder: 'valid data',
                validateInput: v => v.trim() ? null : 'Name cannot be empty',
            })
            if (!name) return
            await cases.save(endpointKey, {
                name:        name.trim(),
                body:        message.body || undefined,
                pathParams:  message.pathParams  && Object.keys(message.pathParams).length  ? message.pathParams  : undefined,
                queryParams: message.queryParams && Object.keys(message.queryParams).length ? message.queryParams : undefined,
            })
            await postCases()
            vscode.window.setStatusBarMessage(`Zerk: Saved case "${name.trim()}"`, 2500)
            return
        }

        if (message.type === "deleteCase") {
            await cases.delete(endpointKey, message.name)
            await postCases()
            return
        }

        if (message.type === "openConfig") {
            vscode.commands.executeCommand('apiExplorer.openConfig')
            return
        }

        if (message.type === "useAsAuth") {
            await config.saveProjectConfig({
                ...config.projectConfig,
                auth: { type: 'bearer', token: message.token }
            })

            await authStore.save({
                token:        message.token,
                expiresAt:    undefined,
                endpointKey,
                endpointPath: endpoint.path,
                storedAt:     Date.now(),
            })
            treeProvider.setAuthEndpoint(endpointKey)
            vscode.window.showInformationMessage(
                'Zerk: Token set. Attached to all requests automatically.'
            )
            return
        }

        if (message.type === "openInEditor") {
            const { content } = message
            const doc = await vscode.workspace.openTextDocument({
                content,
                language: 'json',
            })
            await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Beside,
                preview:    false,
            })
            return
        }

        if (message.type === "sendRequest") {
            const { url, method, body } = message
            const contentType: string = message.contentType || 'application/json'

            try {
                const result = await executeRequest({ method, url, body, contentType }, config, authStore)

                panel.webview.postMessage({
                    type:       "response",
                    status:     result.status,
                    statusText: result.statusText,
                    elapsed:    result.elapsed,
                    data:       result.data,
                })

                // Update sidebar error state
                if (result.status >= 500) {
                    treeProvider.setEndpointError(endpointKey, result.status)
                } else {
                    treeProvider.clearEndpointError(endpointKey)
                }

                history.add({
                    method,
                    path:         endpoint.path,
                    url,
                    status:       result.status,
                    statusText:   result.statusText,
                    elapsed:      result.elapsed,
                    timestamp:    Date.now(),
                    body:         body || undefined,
                    responseBody: typeof result.data === "string"
                                    ? result.data
                                    : JSON.stringify(result.data, null, 2),
                })

                // ── Auth token detection ──────────────────────────────────────
                // Only check on 2xx responses, only if not already ignored
                if (
                    result.status >= 200 &&
                    result.status < 300 &&
                    !authStore.isIgnored(endpointKey) &&
                    !authStore.isAuthEndpoint(endpointKey) &&
                    shouldPromptForToken(endpoint, result.data)
                ) {
                    const extracted = extractToken(result.data)
                    if (extracted) {
                        promptToStoreToken(
                            endpoint, endpointKey, extracted, authStore, treeProvider, config
                        )
                    }
                }

            } catch (err: any) {
                panel.webview.postMessage({ type: "error", message: err.message })
            }
        }

        // ── Run all saved cases for this endpoint ─────────────────────────────
        if (message.type === "runAllCases") {
            const list = await cases.list(endpointKey)
            if (!list.length) {
                panel.webview.postMessage({ type: "runResults", results: [], summary: { passed: 0, total: 0 } })
                return
            }

            // Write methods can modify data — confirm before replaying.
            if (["POST", "PUT", "PATCH", "DELETE"].includes(endpoint.method)) {
                const ok = await vscode.window.showWarningMessage(
                    `Fire ${list.length} ${endpoint.method} request(s) against ${config.baseUrl}? This may modify data.`,
                    { modal: true }, 'Run'
                )
                if (ok !== 'Run') {
                    panel.webview.postMessage({ type: "runResults", results: [], summary: { passed: 0, total: 0, cancelled: true } })
                    return
                }
            }

            const results: any[] = []
            for (const c of list) {
                try {
                    const req = buildRequestFromCase(endpoint, c, config.baseUrl)
                    const r   = await executeRequest(req, config, authStore)
                    results.push({
                        name:       c.name,
                        status:     r.status,
                        statusText: r.statusText,
                        elapsed:    r.elapsed,
                        ok:         r.status >= 200 && r.status < 300,
                        body:       typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2),
                    })
                } catch (err: any) {
                    results.push({ name: c.name, status: 0, statusText: 'error', elapsed: 0, ok: false, body: String(err?.message ?? err) })
                }
            }

            const passed = results.filter(r => r.ok).length
            panel.webview.postMessage({ type: "runResults", results, summary: { passed, total: results.length } })
            return
        }
    })
}

async function promptToStoreToken(
    endpoint:     ApiEndpoint,
    endpointKey:  string,
    extracted:    { token: string; expiresAt: number | undefined },
    authStore:    AuthStore,
    treeProvider: EndpointTreeProvider,
    config:       ConfigManager
): Promise<void> {

    const preview = extracted.token.length > 20
        ? `${extracted.token.slice(0, 20)}…`
        : extracted.token

    const action = await vscode.window.showInformationMessage(
        `Zerk detected an auth token in ${endpoint.method} ${endpoint.path}. Use it for all requests?`,
        'Use Token',
        'Ignore',
        "Don't ask again"
    )

    if (action === 'Use Token') {
        await authStore.save({
            token:        extracted.token,
            expiresAt:    extracted.expiresAt,
            endpointKey,
            endpointPath: endpoint.path,
            storedAt:     Date.now(),
        })

        // Sync to configManager so badge + config panel update immediately
        await config.saveProjectConfig({
            ...config.projectConfig,
            auth: {
                type:  'bearer',
                token: extracted.token,
            }
        })

        // Update tree to show key icon on this endpoint
        treeProvider.setAuthEndpoint(endpointKey)

        const expiry = extracted.expiresAt
            ? ` (expires in ${Math.round((extracted.expiresAt - Date.now()) / 60000)}m)`
            : ''
        vscode.window.showInformationMessage(
            `Zerk: Token stored${expiry}. Attached to all requests automatically.`
        )
    } else if (action === "Don't ask again") {
        await authStore.ignore(endpointKey)
    }
}