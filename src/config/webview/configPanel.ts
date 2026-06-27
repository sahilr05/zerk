/**
 * configPanel.ts
 * Manages the project configuration webview panel.
 * Singleton — only one config panel open at a time.
 */

import * as vscode       from 'vscode'
import { ConfigManager } from '../configManager'
import { renderConfigPanel } from './configTemplate'

export class ConfigPanel {

    private static _panel: vscode.WebviewPanel | undefined

    public static open(
        context: vscode.ExtensionContext,
        config:  ConfigManager,
        onSaved: () => void   // called after save so extension can re-load spec
    ) {
        // Reuse existing panel if open
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.One)
            return
        }

        const panel = vscode.window.createWebviewPanel(
            'apiExplorerConfig',
            'Zerk — Project Config',
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true }
        )

        panel.webview.html = renderConfigPanel(config.projectConfig)

        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.type === 'save') {
                    await config.saveProjectConfig(message.config)
                    panel.webview.postMessage({ type: 'configSaved' })
                    onSaved()
                }
            },
            undefined,
            context.subscriptions
        )

        panel.onDidDispose(() => {
            this._panel = undefined
        })

        this._panel = panel
    }
}