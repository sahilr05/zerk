/**
 * treeItems.ts
 * All VSCode TreeItem subclasses for the Zerk sidebar.
 */

import * as vscode    from 'vscode'
import { ApiEndpoint } from '../types/endpoint'
import { stripModulePrefix } from './inferModule'

export const METHOD_COLORS: Record<string, string> = {
    GET:    "charts.green",
    POST:   "charts.blue",
    PUT:    "charts.yellow",
    DELETE: "charts.red",
    PATCH:  "charts.purple",
}

const METHOD_SVG: Record<string, string> = {
    GET:    "method-get.svg",
    POST:   "method-post.svg",
    PUT:    "method-put.svg",
    PATCH:  "method-patch.svg",
    DELETE: "method-delete.svg",
}

// ── Method group ──────────────────────────────────────────────────────────────

export class MethodGroupItem extends vscode.TreeItem {
    constructor(public readonly method: string, count: number) {
        super(method, vscode.TreeItemCollapsibleState.Expanded)
        this.description  = `${count}`
        this.tooltip      = `${method} — ${count} endpoint${count !== 1 ? "s" : ""}`
        this.iconPath     = new vscode.ThemeIcon(
            "symbol-method",
            new vscode.ThemeColor(METHOD_COLORS[method] ?? "foreground")
        )
        this.contextValue = "methodGroup"
    }
}

// ── Module group (recursive — can contain sub-groups or endpoints) ─────────────

export class ModuleGroupItem extends vscode.TreeItem {
    constructor(
        public readonly moduleName: string,
        public readonly modulePath: string[],  // full path e.g. ["rfx", "rfp"]
        count: number
    ) {
        super(moduleName, vscode.TreeItemCollapsibleState.Expanded)
        this.description  = `${count}`
        this.tooltip      = `${moduleName} — ${count} endpoint${count !== 1 ? "s" : ""}`
        this.iconPath     = new vscode.ThemeIcon("folder")
        this.contextValue = "moduleGroup"
    }
}

// ── Endpoint ──────────────────────────────────────────────────────────────────

export class EndpointItem extends vscode.TreeItem {
    constructor(
        public readonly endpoint:  ApiEndpoint,
        extensionUri:              vscode.Uri,
        errorStatus?:              number,
        modulePathContext?:        string[],   // full module path for prefix stripping
        isAuth?:                   boolean
    ) {
        const displayPath = modulePathContext && modulePathContext.length > 0
            ? stripModulePrefix(endpoint.path, modulePathContext)
            : endpoint.path

        super(displayPath, vscode.TreeItemCollapsibleState.None)

        this.description = endpoint.summary || ""

        if (errorStatus) {
            this.description = `${endpoint.summary || ""}  · ${errorStatus}`.trim()
            this.iconPath    = new vscode.ThemeIcon(
                "error",
                new vscode.ThemeColor("list.errorForeground")
            )
        } else if (isAuth) {
            this.iconPath = new vscode.ThemeIcon(
                "key",
                new vscode.ThemeColor(METHOD_COLORS[endpoint.method] ?? "foreground")
            )
        } else {
            const svgFile = METHOD_SVG[endpoint.method]
            if (svgFile) {
                this.iconPath = {
                    light: vscode.Uri.joinPath(extensionUri, "resources", "icons", svgFile),
                    dark:  vscode.Uri.joinPath(extensionUri, "resources", "icons", svgFile),
                }
            } else {
                this.iconPath = new vscode.ThemeIcon(
                    "circle-small-filled",
                    new vscode.ThemeColor(METHOD_COLORS[endpoint.method] ?? "foreground")
                )
            }
        }

        this.tooltip = new vscode.MarkdownString(
            `**${endpoint.method}** \`${endpoint.path}\`` +
            (endpoint.summary     ? `\n\n${endpoint.summary}` : "") +
            (errorStatus          ? `\n\n⚠ Last request failed with **${errorStatus}**` : "") +
            (endpoint.operationId ? `\n\n*operationId: \`${endpoint.operationId}\`*` : "")
        )

        this.command = {
            command:   "apiExplorer.openRequest",
            title:     "Open Request",
            arguments: [endpoint],
        }
        this.contextValue = endpoint.operationId ? "endpointWithSource" : "endpoint"
    }
}

// ── Info / empty state ────────────────────────────────────────────────────────

export class InfoItem extends vscode.TreeItem {
    constructor(message: string, icon: string) {
        super(message, vscode.TreeItemCollapsibleState.None)
        this.iconPath     = new vscode.ThemeIcon(icon)
        this.contextValue = "info"
    }
}