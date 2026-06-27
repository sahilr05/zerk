/**
 * sourceNavigator.ts
 *
 * Registers and handles the "Go to Source" command.
 * Finds the source location via sourceMapper, then opens
 * the file at the exact line in the editor.
 */

import * as vscode       from "vscode"
import { ApiEndpoint }   from "../types/endpoint"
import { findSourceLocation, formatSourceLocation } from "./sourceMapper"

export async function goToSource(endpoint: ApiEndpoint): Promise<void> {

    if (!endpoint.operationId) {
        vscode.window.showWarningMessage(
            `Zerk: No operationId found for ${endpoint.method} ${endpoint.path}. ` +
            `Source navigation requires an operationId in the OpenAPI spec.`
        )
        return
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title:    `Finding source for ${endpoint.method} ${endpoint.path}…`,
            cancellable: false,
        },
        async () => {
            const loc = await findSourceLocation(endpoint)

            if (!loc) {
                vscode.window.showWarningMessage(
                    `Zerk: Could not find source for "${endpoint.operationId}". ` +
                    `Make sure your Python files are in the workspace.`
                )
                return
            }

            // Open the file
            const doc = await vscode.workspace.openTextDocument(loc.uri)
            const editor = await vscode.window.showTextDocument(doc, {
                preview:      false,
                viewColumn:   vscode.ViewColumn.One,
            })

            // Move cursor to the handler line and reveal it centered
            const position = new vscode.Position(loc.line, 0)
            editor.selection = new vscode.Selection(position, position)
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            )

            // Briefly highlight the line so it's obvious where we landed
            const decoration = vscode.window.createTextEditorDecorationType({
                backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
                isWholeLine:     true,
            })
            editor.setDecorations(decoration, [new vscode.Range(position, position)])
            setTimeout(() => decoration.dispose(), 1500)

            const label = formatSourceLocation(loc, vscode.workspace.workspaceFolders?.[0]?.uri!)
            vscode.window.setStatusBarMessage(`Zerk: Found at ${label}`, 3000)
        }
    )
}