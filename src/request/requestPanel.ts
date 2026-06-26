/**
 * requestPanel.ts
 * Each endpoint gets its own tab in ViewColumn.Active.
 * Same endpoint clicked again → reveal existing tab.
 * History entries get their own dedicated tabs keyed by entry id.
 */

import * as vscode        from "vscode"
import { ApiEndpoint }    from "../types/endpoint"
import { ConfigManager }  from "../config/configManager"
import { HistoryManager } from "../history/historyManager"
import { EndpointTreeProvider } from "../explorer/endpointTreeProvider"
import { AuthStore }            from "../auth/authStore"
import { CasesStore }           from "../cases/casesStore"
import { renderPanel, RestoredState } from "./webview/template"
import { attachRequestHandler }       from "./requestHandler"

const METHOD_TAB_ICON: Record<string, string> = {
    GET:    "method-get.svg",
    POST:   "method-post.svg",
    PUT:    "method-put.svg",
    PATCH:  "method-patch.svg",
    DELETE: "method-delete.svg",
}

export class RequestPanel {

    private static _panels      = new Map<string, vscode.WebviewPanel>()
    private static _disposables = new Map<string, vscode.Disposable>()
    private static _historyPanels = new Map<string, vscode.WebviewPanel>()

    public static notifyConfigChanged(auth: import("../config/configManager").AuthConfig) {
        const msg = { type: 'configUpdated', auth }
        this._panels.forEach(p => p.webview.postMessage(msg))
        this._historyPanels.forEach(p => p.webview.postMessage(msg))
    }

    public static create(
        endpoint:     ApiEndpoint,
        context:      vscode.ExtensionContext,
        config:       ConfigManager,
        history:      HistoryManager,
        treeProvider: EndpointTreeProvider,
        authStore:    AuthStore,
        cases:        CasesStore,
        restored?:    RestoredState,
        panelKey?:    string
    ) {
        if (panelKey) {
            const existing = this._historyPanels.get(panelKey)
            if (existing) { existing.reveal(vscode.ViewColumn.Active); return }

            const p = this._makePanel(panelKey, endpoint, config, history, treeProvider, authStore, cases, context.extensionUri, restored)
            this._historyPanels.set(panelKey, p)
            p.onDidDispose(() => this._historyPanels.delete(panelKey))
            return
        }

        const key = `${endpoint.method}:${endpoint.path}`

        const existing = this._panels.get(key)
        if (existing) { existing.reveal(vscode.ViewColumn.Active); return }

        const panel = this._makePanel(key, endpoint, config, history, treeProvider, authStore, cases, context.extensionUri, restored)
        this._panels.set(key, panel)
        panel.onDidDispose(() => {
            this._panels.delete(key)
            this._disposables.get(key)?.dispose()
            this._disposables.delete(key)
        })
    }

    private static _makePanel(
        key:          string,
        endpoint:     ApiEndpoint,
        config:       ConfigManager,
        history:      HistoryManager,
        treeProvider: EndpointTreeProvider,
        authStore:    AuthStore,
        cases:        CasesStore,
        extensionUri: vscode.Uri,
        restored?:    RestoredState
    ): vscode.WebviewPanel {

        const panel = vscode.window.createWebviewPanel(
            "apiExplorerRequest",
            `${endpoint.method} ${endpoint.path}`,
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true }
        )

        // Method-colored tab icon so request tabs are scannable apart from code files
        const svg = METHOD_TAB_ICON[endpoint.method]
        if (svg) {
            const icon = vscode.Uri.joinPath(extensionUri, "resources", "icons", svg)
            panel.iconPath = { light: icon, dark: icon }
        }

        panel.webview.html = renderPanel(endpoint, config.baseUrl, restored, config.auth)

        const disposable = attachRequestHandler(
            panel, endpoint, config, history, treeProvider, authStore, cases, () => {}
        )
        this._disposables.set(key, disposable)
        panel.onDidDispose(() => disposable.dispose())

        return panel
    }
}