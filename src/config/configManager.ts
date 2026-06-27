import * as vscode from 'vscode'

export type AuthType = 'none' | 'bearer' | 'apikey' | 'basic'

export interface AuthConfig {
    type:          AuthType
    token?:        string
    apiKeyName?:   string
    apiKeyValue?:  string
    basicUser?:    string
    basicPass?:    string
}

export interface ProjectConfig {
    baseUrl:        string
    auth:           AuthConfig
    defaultHeaders: Record<string, string>
}

const BASE_URL_KEY   = 'apiExplorer.baseUrl'
const AUTH_KEY       = 'apiExplorer.auth'
const HEADERS_KEY    = 'apiExplorer.defaultHeaders'
const DEFAULT_URL    = 'http://localhost:8000'

export class ConfigManager {

    private _context: vscode.ExtensionContext
    private _baseUrl: string
    private _auth:    AuthConfig
    private _headers: Record<string, string>

    private _onDidChange = new vscode.EventEmitter<void>()
    readonly onDidChange: vscode.Event<void> = this._onDidChange.event

    constructor(context: vscode.ExtensionContext) {
        this._context = context

        const saved = context.workspaceState.get<string>(BASE_URL_KEY)
        if (saved) {
            this._baseUrl = saved
        } else {
            const settingsUrl = vscode.workspace
                .getConfiguration('apiExplorer')
                .get<string>('openapiUrl') || DEFAULT_URL
            this._baseUrl = settingsUrl.replace(/\/openapi\.json$/, '')
        }

        this._auth    = context.workspaceState.get<AuthConfig>(AUTH_KEY)    ?? { type: 'none' }
        this._headers = context.workspaceState.get<Record<string, string>>(HEADERS_KEY) ?? {
            'Content-Type': 'application/json'
        }
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    get baseUrl(): string { return this._baseUrl }
    get openApiUrl(): string { return `${this._baseUrl}/openapi.json` }
    get auth(): AuthConfig { return this._auth }
    get defaultHeaders(): Record<string, string> { return this._headers }

    get projectConfig(): ProjectConfig {
        return {
            baseUrl:        this._baseUrl,
            auth:           this._auth,
            defaultHeaders: this._headers,
        }
    }

    // ── Build headers for a request ───────────────────────────────────────────
    // Merges default headers + auth header into one object
    // Request-specific headers passed in take priority

    buildRequestHeaders(overrides: Record<string, string> = {}): Record<string, string> {
        const headers: Record<string, string> = { ...this._headers }

        switch (this._auth.type) {
            case 'bearer':
                if (this._auth.token) {
                    headers['Authorization'] = `Bearer ${this._auth.token}`
                }
                break
            case 'apikey':
                if (this._auth.apiKeyName && this._auth.apiKeyValue) {
                    headers[this._auth.apiKeyName] = this._auth.apiKeyValue
                }
                break
            case 'basic':
                if (this._auth.basicUser && this._auth.basicPass) {
                    const encoded = Buffer.from(`${this._auth.basicUser}:${this._auth.basicPass}`).toString('base64')
                    headers['Authorization'] = `Basic ${encoded}`
                }
                break
        }

        return { ...headers, ...overrides }
    }

    // ── Save full config from panel ───────────────────────────────────────────

    async saveProjectConfig(config: ProjectConfig): Promise<void> {
        this._baseUrl = config.baseUrl.replace(/\/$/, '')
        this._auth    = config.auth
        this._headers = config.defaultHeaders

        await this._context.workspaceState.update(BASE_URL_KEY, this._baseUrl)
        await this._context.workspaceState.update(AUTH_KEY, this._auth)
        await this._context.workspaceState.update(HEADERS_KEY, this._headers)

        this._onDidChange.fire()
    }

    // ── Legacy prompt (keep for status bar click) ─────────────────────────────

    async promptChange(): Promise<boolean> {
        const input = await vscode.window.showInputBox({
            title:    'Zerk — Set Base URL',
            prompt:   'Base URL for this workspace',
            value:    this._baseUrl,
            validateInput: (v) =>
                v.startsWith('http://') || v.startsWith('https://')
                    ? null
                    : 'URL must start with http:// or https://'
        })
        if (input === undefined) return false
        await this.saveProjectConfig({
            ...this.projectConfig,
            baseUrl: input
        })
        return true
    }

    dispose() { this._onDidChange.dispose() }
}