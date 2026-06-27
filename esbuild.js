/**
 * esbuild.js
 * Bundles ONLY the MCP server (the sole consumer of @modelcontextprotocol/sdk)
 * into a single self-contained out/mcp/server.js, so the SDK's transitive deps
 * do not ship raw in the .vsix. The extension itself has no runtime node_modules
 * (it only uses the host-provided `vscode`), so node_modules is excluded entirely.
 *
 * The extension is still compiled per-file by tsc (`npm run compile`); this only
 * overwrites out/mcp/server.js with the bundled version.
 */

const esbuild = require("esbuild")
const production = process.argv.includes("--production")

esbuild.build({
    entryPoints: ["src/mcp/server.ts"],
    outfile:     "out/mcp/server.js",
    bundle:      true,
    platform:    "node",
    format:      "cjs",
    target:      "node18",
    sourcemap:   !production,
    minify:      production,
    logLevel:    "info",
}).catch((err) => {
    console.error(err)
    process.exit(1)
})
