import * as vscode from 'vscode'
import { EndpointTreeProvider } from './explorer/endpointTreeProvider'
import { OpenApiLoader }        from './openapi/openApiLoader'
import { OpenApiParser }        from './openapi/openApiParser'
import { RequestPanel }         from './request/requestPanel'
import { ConfigManager }        from './config/configManager'
import { ConfigPanel }          from './config/webview/configPanel'
import { StatusBarManager }     from './statusBar/statusBarManager'
import { HistoryManager }       from './history/historyManager'
import { HistoryTreeProvider }  from './history/historyTreeProvider'
import { AuthStore }            from './auth/authStore'
import { CasesStore }           from './cases/casesStore'
import { registerSmokeTest }    from './smoke/smokeTest'
import { enableMcp }            from './mcp/enableMcp'
import { ApiEndpoint }          from './types/endpoint'
import { TestCase }             from './core/types'
import { readAllCases }         from './core/casesReader'
import { buildRequestFromCase, executeRequest } from './core/executeRequest'
import { resolveHeaders }       from './request/extensionAuth'
import { generatePytest, FiredCase } from './export/pytestExporter'

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

export function activate(context: vscode.ExtensionContext) {

    const config       = new ConfigManager(context)
    const history      = new HistoryManager(context)
    const authStore    = new AuthStore(context)
    const cases        = new CasesStore()
    const treeProvider = new EndpointTreeProvider([], context.extensionUri)
    const histProvider = new HistoryTreeProvider(history)
    const statusBar    = new StatusBarManager(config, context)

    // ── Token expiry monitor ──────────────────────────────────────────────────
    let _expiredAlertShown = false

    const checkExpiry = async () => {
        const activeToken = await authStore.getActiveToken()
        if (!activeToken?.expiresAt) return

        const remaining = activeToken.expiresAt - Date.now()

        if (remaining <= 0 && !_expiredAlertShown) {
            _expiredAlertShown = true
            vscode.window.showWarningMessage(
                `Zerk: Auth token expired. Re-authenticate to continue.`,
                'Open Login'
            ).then(action => {
                if (action === 'Open Login') {
                    const [method] = activeToken.endpointKey.split(':')
                    vscode.commands.executeCommand('apiExplorer.openRequest', {
                        method, path: activeToken.endpointPath
                    })
                }
            })
        } else if (remaining > 0) {
            _expiredAlertShown = false
        }
    }

    checkExpiry()
    const expiryTimer = setInterval(checkExpiry, 30_000)
    context.subscriptions.push({ dispose: () => clearInterval(expiryTimer) })

    // ── MCP token file ────────────────────────────────────────────────────────
    // The bundled MCP server reads the bearer token from this file (ZERK_TOKEN_FILE),
    // so the agent always fires with a current token. We rewrite it whenever auth changes.
    const mcpTokenUri = vscode.Uri.joinPath(context.globalStorageUri, 'mcp-token')
    const syncMcpToken = async () => {
        try {
            await vscode.workspace.fs.createDirectory(context.globalStorageUri)
            const active = await authStore.getActiveToken()
            let token = active && (!active.expiresAt || active.expiresAt > Date.now()) ? active.token : undefined
            if (!token && config.auth.type === 'bearer' && config.auth.token) token = config.auth.token
            await vscode.workspace.fs.writeFile(mcpTokenUri, Buffer.from(token ?? '', 'utf8'))
        } catch { /* best effort */ }
    }
    syncMcpToken()

    // Restore auth endpoint markers in tree on startup
    authStore.onDidChange(() => { _expiredAlertShown = false; checkExpiry(); syncMcpToken() })

    authStore.getAll().then(async tokens => {
        treeProvider.setAuthEndpoints(tokens.map(t => t.endpointKey))

        const activeToken = await authStore.getActiveToken()
        if (activeToken && config.projectConfig.auth.type === 'none') {
            await config.saveProjectConfig({
                ...config.projectConfig,
                auth: { type: 'bearer', token: activeToken.token }
            })
        }
        checkExpiry()
    })

    // ── Version update notification ───────────────────────────────────────────
    const currentVersion = vscode.extensions.getExtension('sahilrajpal.api-explorer')?.packageJSON?.version
    const lastVersion = context.globalState.get<string>('apiExplorer.lastVersion')

    if (currentVersion && lastVersion && currentVersion !== lastVersion) {
        vscode.window.showInformationMessage(
            `Zerk updated to v${currentVersion}`,
            "What's New",
        ).then(action => {
            if (action === "What's New") {
                const changelogUri = vscode.Uri.joinPath(
                    context.extensionUri, 'CHANGELOG.md'
                )
                vscode.commands.executeCommand('markdown.showPreview', changelogUri)
            }
        })
    }

    if (currentVersion) {
        context.globalState.update('apiExplorer.lastVersion', currentVersion)
    }

    vscode.window.registerTreeDataProvider('apiExplorer.endpoints', treeProvider)
    vscode.window.registerTreeDataProvider('apiExplorer.history',   histProvider)

    // ── Auto-reconnect polling ────────────────────────────────────────────────
    // Only polls when server is unreachable - stops as soon as connected
    // Interval: 3s. Devs just start their server and the tree populates automatically.
    let _pollTimer:    NodeJS.Timeout | undefined
    let _isConnected = false

    const startPolling = () => {
        if (_pollTimer) return // already polling
        _pollTimer = setInterval(async () => {
            try {
                const spec      = await OpenApiLoader.fetchSpec(config.openApiUrl)
                const endpoints = OpenApiParser.parse(spec)
                treeProvider.setEndpoints(endpoints)
                statusBar.setConnected(endpoints.length)
                _isConnected = true
                stopPolling()
                vscode.window.setStatusBarMessage(
                    `Zerk: Connected - ${endpoints.length} endpoints loaded`, 3000
                )
            } catch {
                // still offline - keep polling silently
            }
        }, 3000)
    }

    const stopPolling = () => {
        if (_pollTimer) {
            clearInterval(_pollTimer)
            _pollTimer = undefined
        }
    }

    // Clean up on deactivate
    context.subscriptions.push({ dispose: stopPolling })

    // ── Load endpoints ────────────────────────────────────────────────────────
    const loadEndpoints = async () => {
        statusBar.setLoading()
        stopPolling() // stop any existing poll before trying fresh
        try {
            const spec      = await OpenApiLoader.fetchSpec(config.openApiUrl)
            const endpoints = OpenApiParser.parse(spec)
            treeProvider.setEndpoints(endpoints)
            statusBar.setConnected(endpoints.length)
            _isConnected = true
        } catch (err: any) {
            // Show friendly empty state in tree instead of a toast
            treeProvider.setOffline(config.openApiUrl)
            statusBar.setError()
            _isConnected = false
            // Start quietly polling in the background
            startPolling()
        }
    }

    loadEndpoints()

    // Re-load spec when base URL or auth config changes
    config.onDidChange(() => loadEndpoints())

    // Update auth badge on all open panels when config changes
    config.onDidChange(() => {
        RequestPanel.notifyConfigChanged(config.auth)
    })

    // keep the MCP token file in step with config-driven auth changes too
    config.onDidChange(() => syncMcpToken())

    // ── Config panel ──────────────────────────────────────────────────────────
    const openConfigCommand = vscode.commands.registerCommand(
        'apiExplorer.openConfig',
        () => ConfigPanel.open(context, config, loadEndpoints)
    )

    // ── Enable MCP for AI agents ──────────────────────────────────────────────
    const enableMcpCommand = vscode.commands.registerCommand(
        'apiExplorer.enableMcp',
        async () => {
            await syncMcpToken()
            await enableMcp(context, config, mcpTokenUri.fsPath)
        }
    )

    // ── Search ────────────────────────────────────────────────────────────────
    let activeSearch: vscode.InputBox | undefined

    const searchCommand = vscode.commands.registerCommand('apiExplorer.search', () => {
        if (activeSearch) { activeSearch.show(); return }
        const box = vscode.window.createInputBox()
        box.placeholder = "Search endpoints by path or description…"
        box.onDidChangeValue(value => {
            treeProvider.setSearchQuery(value)
            vscode.commands.executeCommand('setContext', 'apiExplorer.searchActive', value.length > 0)
        })
        box.onDidAccept(() => box.hide())
        box.onDidHide(() => { activeSearch = undefined })
        activeSearch = box
        box.show()
    })

    const clearSearchCommand = vscode.commands.registerCommand('apiExplorer.clearSearch', () => {
        treeProvider.setSearchQuery("")
        activeSearch?.dispose()
        activeSearch = undefined
        vscode.commands.executeCommand('setContext', 'apiExplorer.searchActive', false)
    })

    // ── Core commands ─────────────────────────────────────────────────────────
    const refreshCommand = vscode.commands.registerCommand(
        'apiExplorer.refresh', loadEndpoints
    )

    const changeBaseUrlCommand = vscode.commands.registerCommand(
        'apiExplorer.changeBaseUrl',
        async () => {
            const changed = await config.promptChange()
            if (changed) loadEndpoints()
        }
    )

    const openRequestCommand = vscode.commands.registerCommand(
        'apiExplorer.openRequest',
        (endpoint: ApiEndpoint) => RequestPanel.create(endpoint, context, config, history, treeProvider, authStore, cases)
    )

    const openFromHistoryCommand = vscode.commands.registerCommand(
        'apiExplorer.openFromHistory',
        (entry) => {
            const endpoint: ApiEndpoint = {
                method:  entry.method,
                path:    entry.path,
                summary: `From history - ${entry.status} ${entry.statusText}`,
            }
            RequestPanel.create(endpoint, context, config, history, treeProvider, authStore, cases, {
                requestBody:  entry.body,
                responseBody: entry.responseBody,
                status:       entry.status,
                statusText:   entry.statusText,
                elapsed:      entry.elapsed,
            }, entry.id)
        }
    )

    const clearHistoryCommand = vscode.commands.registerCommand(
        'apiExplorer.clearHistory',
        async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Clear all request history for this workspace?',
                { modal: true }, 'Clear'
            )
            if (confirm === 'Clear') history.clear()
        }
    )

    // ── Grouping / filter / sort ──────────────────────────────────────────────
    const groupByMethodCommand = vscode.commands.registerCommand(
        'apiExplorer.groupByMethod',
        () => {
            treeProvider.setGroupMode("method")
            vscode.commands.executeCommand('setContext', 'apiExplorer.groupMode', 'method')
        }
    )

    const groupByModuleCommand = vscode.commands.registerCommand(
        'apiExplorer.groupByModule',
        () => {
            treeProvider.setGroupMode("module")
            vscode.commands.executeCommand('setContext', 'apiExplorer.groupMode', 'module')
        }
    )

    // ── Combined filter & sort ────────────────────────────────────────────────
    const filterMethodCommand = vscode.commands.registerCommand(
        'apiExplorer.filterByMethod', () =>
            vscode.commands.executeCommand('apiExplorer.filterAndSort')
    )

    const filterModuleCommand = vscode.commands.registerCommand(
        'apiExplorer.filterByModule', () =>
            vscode.commands.executeCommand('apiExplorer.filterAndSort')
    )

    const toggleSortCommand = vscode.commands.registerCommand(
        'apiExplorer.toggleSort', () =>
            vscode.commands.executeCommand('apiExplorer.filterAndSort')
    )

    const filterAndSortCommand = vscode.commands.registerCommand(
        'apiExplorer.filterAndSort',
        async () => {
            const allModules   = treeProvider.allModules
            const methodFilter = treeProvider.methodFilters
            const moduleFilter = treeProvider.moduleFilters

            type Item = vscode.QuickPickItem & { _id?: string }

            const items: Item[] = [
                // ── Methods ──────────────────────────────────────────────────
                { label: 'HTTP Methods', kind: vscode.QuickPickItemKind.Separator },
                ...ALL_METHODS.map(m => ({
                    label:   m,
                    picked:  methodFilter.size === 0 ? true : methodFilter.has(m),
                    _id:     `method:${m}`,
                })),
                // ── Modules ───────────────────────────────────────────────────
                ...(allModules.length > 0 ? [
                    { label: 'Modules', kind: vscode.QuickPickItemKind.Separator },
                    ...allModules.map(m => ({
                        label:   m,
                        picked:  moduleFilter.size === 0 ? true : moduleFilter.has(m),
                        _id:     `module:${m}`,
                    }))
                ] : []),
            ]

            const picked = await vscode.window.showQuickPick(items, {
                canPickMany:  true,
                title:        'Filter Endpoints',
                placeHolder:  'Select to apply - uncheck to remove',
            })

            if (!picked) return

            // ── Apply method filter ───────────────────────────────────────────
            const pickedMethods = picked
                .filter(p => p._id?.startsWith('method:'))
                .map(p => p._id!.replace('method:', ''))

            treeProvider.setMethodFilters(
                pickedMethods.length === ALL_METHODS.length || pickedMethods.length === 0
                    ? new Set()
                    : new Set(pickedMethods)
            )

            // ── Apply module filter ───────────────────────────────────────────
            if (allModules.length > 0) {
                const pickedModules = picked
                    .filter(p => p._id?.startsWith('module:'))
                    .map(p => p._id!.replace('module:', ''))

                treeProvider.setModuleFilters(
                    pickedModules.length === allModules.length || pickedModules.length === 0
                        ? new Set()
                        : new Set(pickedModules)
                )
            }
        }
    )

    // ── Export saved cases to a runnable pytest file ──────────────────────────
    const exportPytestCommand = vscode.commands.registerCommand(
        'apiExplorer.exportPytest',
        async () => {
            const folder = vscode.workspace.workspaceFolders?.[0]
            if (!folder) {
                vscode.window.showWarningMessage('Zerk: Open a folder to export saved cases.')
                return
            }

            // Match each saved case to a currently discovered endpoint.
            const epMap = new Map<string, ApiEndpoint>()
            for (const e of treeProvider.endpoints) epMap.set(`${e.method}:${e.path}`, e)

            const pairs:   { endpoint: ApiEndpoint; testCase: TestCase }[] = []
            const skipped: string[] = []
            for (const [key, list] of Object.entries(readAllCases(folder.uri.fsPath))) {
                const ep = epMap.get(key)
                if (!ep) { if (list.length) skipped.push(key); continue }
                for (const tc of list) pairs.push({ endpoint: ep, testCase: tc })
            }

            if (pairs.length === 0) {
                vscode.window.showInformationMessage(
                    treeProvider.endpoints.length === 0
                        ? 'Zerk: Connect to your server first, then export.'
                        : 'Zerk: No saved cases to export. Save a case on an endpoint first.'
                )
                return
            }

            const writes = pairs.filter(p =>
                ['POST', 'PUT', 'PATCH', 'DELETE'].includes(p.endpoint.method)
            ).length

            const ok = await vscode.window.showWarningMessage(
                `Zerk will fire ${pairs.length} request(s) against ${config.baseUrl} to record real responses` +
                (writes ? `, including ${writes} write request(s) that may modify data.` : '.') +
                ' Continue?',
                { modal: true }, 'Fire & Export'
            )
            if (ok !== 'Fire & Export') return

            const headers = await resolveHeaders(config, authStore)
            const fired:  FiredCase[] = []

            const failure = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Zerk: Recording responses' },
                async (progress) => {
                    let i = 0
                    for (const { endpoint, testCase } of pairs) {
                        progress.report({ message: `${++i}/${pairs.length} ${endpoint.method} ${endpoint.path}` })
                        try {
                            const req = buildRequestFromCase(endpoint, testCase, config.baseUrl)
                            const r   = await executeRequest(req, headers)
                            fired.push({ endpoint, testCase, status: r.status, response: r.data })
                        } catch (err: any) {
                            return `Could not reach ${config.baseUrl} (${err?.message ?? err}). Start your server and retry.`
                        }
                    }
                    return null
                }
            )

            if (failure) { vscode.window.showErrorMessage('Zerk: ' + failure); return }

            const target = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.joinPath(folder.uri, 'test_zerk.py'),
                filters:    { Python: ['py'] },
                saveLabel:  'Save pytest file',
            })
            if (!target) return

            await vscode.workspace.fs.writeFile(
                target, Buffer.from(generatePytest(fired, config.baseUrl), 'utf8')
            )
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target))

            vscode.window.showInformationMessage(
                `Zerk: Exported ${fired.length} test(s).` +
                (skipped.length ? ` Skipped ${skipped.length} (endpoint not in current spec).` : '')
            )
        }
    )

    // ── Smoke test (run-all module / whole surface) ───────────────────────────
    const smokeCommands = registerSmokeTest(context, treeProvider, cases, config, authStore)

    // ── Initial context ───────────────────────────────────────────────────────
    vscode.commands.executeCommand('setContext', 'apiExplorer.groupMode', 'module')
    vscode.commands.executeCommand('setContext', 'apiExplorer.searchActive', false)

    context.subscriptions.push(
        openConfigCommand,
        enableMcpCommand,
        searchCommand, clearSearchCommand,
        refreshCommand, changeBaseUrlCommand,
        openRequestCommand, openFromHistoryCommand, clearHistoryCommand,
        groupByMethodCommand, groupByModuleCommand,
        filterMethodCommand, filterModuleCommand,
        toggleSortCommand, filterAndSortCommand,
        exportPytestCommand,
        authStore,
        cases,
        config,
        ...smokeCommands,
    )
}