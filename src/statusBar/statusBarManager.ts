import * as vscode from 'vscode'
import { ConfigManager } from '../config/configManager'

type ConnectionState = 'loading' | 'connected' | 'error'

export class StatusBarManager {

    private _item: vscode.StatusBarItem
    private _config: ConfigManager
    private _state: ConnectionState = 'loading'
    private _endpointCount: number = 0

    constructor(config: ConfigManager, context: vscode.ExtensionContext) {

        this._config = config

        // Right side, high priority so it stays visible
        this._item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            1000
        )

        // Clicking the status bar item triggers the base URL change prompt
        // then a refresh — registered in extension.ts
        this._item.command = 'apiExplorer.changeBaseUrl'
        this._item.show()

        context.subscriptions.push(this._item)

        // Re-render whenever base URL changes
        config.onDidChange(() => this.setLoading())
    }

    // Call this while the spec is being fetched
    setLoading() {
        this._state = 'loading'
        this._render()
    }

    // Call this when spec loaded successfully
    setConnected(endpointCount: number) {
        this._state = 'connected'
        this._endpointCount = endpointCount
        this._render()
    }

    // Call this when fetch fails
    setError() {
        this._state = 'error'
        this._render()
    }

    private _render() {

        const host = this._trimUrl(this._config.baseUrl)

        switch (this._state) {

            case 'loading':
                this._item.text    = `$(loading~spin) Zerk`
                this._item.tooltip = `Connecting to ${this._config.baseUrl}…\nClick to change base URL`
                this._item.color   = undefined
                break

            case 'connected':
                this._item.text    = `$(plug) ${host} · ${this._endpointCount} endpoints`
                this._item.tooltip = new vscode.MarkdownString(
                    `**Zerk** — Connected\n\n` +
                    `Base URL: \`${this._config.baseUrl}\`\n\n` +
                    `Click to change base URL`
                )
                this._item.color   = new vscode.ThemeColor('statusBarItem.prominentForeground')
                break

            case 'error':
                this._item.text    = `$(error) Zerk · offline`
                this._item.tooltip = new vscode.MarkdownString(
                    `**Zerk** — Could not reach server\n\n` +
                    `Tried: \`${this._config.baseUrl}/openapi.json\`\n\n` +
                    `Click to change base URL`
                )
                this._item.color   = new vscode.ThemeColor('statusBarItem.errorForeground')
                break

        }
    }

    // Trims http://localhost:8000 → localhost:8000 for compact display
    private _trimUrl(url: string): string {
        return url.replace(/^https?:\/\//, '')
    }

    dispose() {
        this._item.dispose()
    }
}