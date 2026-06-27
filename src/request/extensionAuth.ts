/**
 * extensionAuth.ts
 * The extension's vscode-coupled bridge to core/executeRequest: resolves the
 * request headers (default headers + configured auth + the active stored token)
 * so the request panel and "Run all" / smoke test all build auth the same way.
 * The MCP server has its own equivalent (keychain / env), so core stays vscode-free.
 */

import { ConfigManager } from "../config/configManager"
import { AuthStore }     from "../auth/authStore"

export async function resolveHeaders(
    config:    ConfigManager,
    authStore: AuthStore
): Promise<Record<string, string>> {

    const activeToken = await authStore.getActiveToken()
    const authOverride: Record<string, string> =
        activeToken && (!activeToken.expiresAt || activeToken.expiresAt > Date.now())
            ? { Authorization: `Bearer ${activeToken.token}` }
            : {}

    return config.buildRequestHeaders(authOverride)
}
