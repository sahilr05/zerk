/**
 * core/types.ts
 * Shared, vscode-free types used by both the extension and (later) the MCP server.
 * Nothing in src/core may import `vscode` - it must run in a plain Node process.
 */

export interface TestCase {
    name:         string
    body?:        string                      // raw request body text (kept as-is, may be empty)
    pathParams?:  Record<string, string>
    queryParams?: Record<string, string>
}
