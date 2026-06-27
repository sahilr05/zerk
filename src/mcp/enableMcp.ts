/**
 * enableMcp.ts
 * The "Enable Zerk MCP" command: wires the bundled MCP server into the host
 * editor's agent config so the user does not hand-edit JSON. Detects Windsurf /
 * Cursor and writes their MCP config; otherwise copies the snippet to clipboard.
 *
 * Auth: we point ZERK_TOKEN_FILE at a file the extension keeps current (see
 * extension.ts), so the agent always fires with a fresh token without restarts.
 */

import * as vscode from "vscode"
import * as os     from "os"
import * as path   from "path"
import { ConfigManager } from "../config/configManager"

interface McpTarget {
    name:       string
    configPath: string
}

function detectTarget(): McpTarget | null {
    const app  = vscode.env.appName.toLowerCase()
    const home = os.homedir()

    if (app.includes("windsurf")) {
        return { name: "Windsurf", configPath: path.join(home, ".codeium", "windsurf", "mcp_config.json") }
    }
    if (app.includes("cursor")) {
        return { name: "Cursor", configPath: path.join(home, ".cursor", "mcp.json") }
    }
    return null
}

function buildServerEntry(context: vscode.ExtensionContext, config: ConfigManager, tokenFile: string) {
    return {
        command: "node",
        args:    [vscode.Uri.joinPath(context.extensionUri, "out", "mcp", "server.js").fsPath],
        env: {
            ZERK_BASE_URL:    config.baseUrl,
            ZERK_PROJECT_DIR: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
            ZERK_TOKEN_FILE:  tokenFile,
        },
    }
}

export async function enableMcp(
    context:   vscode.ExtensionContext,
    config:    ConfigManager,
    tokenFile: string
): Promise<void> {

    const entry  = buildServerEntry(context, config, tokenFile)
    const target = detectTarget()

    // Unknown editor (or plain VS Code): hand over the snippet.
    if (!target) {
        const snippet = JSON.stringify({ mcpServers: { zerk: entry } }, null, 2)
        await vscode.env.clipboard.writeText(snippet)
        vscode.window.showInformationMessage(
            "Zerk MCP config copied to clipboard. Paste it into your agent's MCP config (mcpServers).",
            "OK"
        )
        return
    }

    const uri = vscode.Uri.file(target.configPath)

    // Merge into any existing config so we don't clobber other servers.
    let json: any = { mcpServers: {} }
    try {
        const buf = await vscode.workspace.fs.readFile(uri)
        const parsed = JSON.parse(Buffer.from(buf).toString("utf8"))
        json = parsed && typeof parsed === "object" ? parsed : {}
        if (!json.mcpServers || typeof json.mcpServers !== "object") json.mcpServers = {}
    } catch {
        // File doesn't exist yet, start fresh.
    }

    json.mcpServers.zerk = entry

    try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target.configPath)))
        await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(json, null, 2) + "\n", "utf8"))
    } catch (err: any) {
        vscode.window.showErrorMessage(`Zerk: could not write ${target.name} MCP config: ${err?.message ?? err}`)
        return
    }

    const choice = await vscode.window.showInformationMessage(
        `Zerk MCP enabled for ${target.name}. Reload ${target.name} so its agent loads it, then ask the agent to use the zerk tools.`,
        "Reload Window",
        "OK"
    )
    if (choice === "Reload Window") {
        vscode.commands.executeCommand("workbench.action.reloadWindow")
    }
}
