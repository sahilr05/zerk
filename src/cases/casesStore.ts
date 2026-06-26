/**
 * casesStore.ts
 * Persists named test cases as a small, git-committable workspace file:
 *   .api-explorer/cases.json
 *
 * The anti-drift principle: we store ONLY the human's input (body + param
 * values + a name) keyed by "METHOD:path". We never store the schema, URL,
 * or response — those are derived from the live spec at render time. A
 * teammate who pulls this file gets your inputs against their own live spec,
 * so there is nothing to drift out of sync.
 */

import * as vscode from 'vscode'

export interface TestCase {
    name:         string
    body?:        string                      // raw request body text (kept as-is, may be empty)
    pathParams?:  Record<string, string>
    queryParams?: Record<string, string>
}

interface CasesFile {
    version: 1
    cases:   Record<string, TestCase[]>       // key = "METHOD:path"
}

const RELATIVE_PATH = ['.api-explorer', 'cases.json']
const EMPTY: CasesFile = { version: 1, cases: {} }

export class CasesStore {

    private _data:   CasesFile = EMPTY
    private _loaded = false

    private _onDidChange = new vscode.EventEmitter<void>()
    readonly onDidChange: vscode.Event<void> = this._onDidChange.event

    // True only when a workspace folder is open — case saving is disabled otherwise.
    get available(): boolean {
        return !!vscode.workspace.workspaceFolders?.length
    }

    private get _fileUri(): vscode.Uri | undefined {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri
        return root ? vscode.Uri.joinPath(root, ...RELATIVE_PATH) : undefined
    }

    // ── Load / persist ──────────────────────────────────────────────────────────

    private async _load(): Promise<void> {
        if (this._loaded) return
        this._loaded = true

        const uri = this._fileUri
        if (!uri) return

        try {
            const bytes  = await vscode.workspace.fs.readFile(uri)
            const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as CasesFile
            if (parsed && parsed.cases) this._data = { version: 1, cases: parsed.cases }
        } catch {
            // File missing or unreadable — start empty, write lazily on first save.
        }
    }

    private async _persist(): Promise<void> {
        const uri = this._fileUri
        if (!uri) return

        const json  = JSON.stringify(this._data, null, 2) + '\n'
        const bytes = Buffer.from(json, 'utf8')

        // vscode.workspace.fs.writeFile creates parent dirs as needed.
        await vscode.workspace.fs.writeFile(uri, bytes)
        this._onDidChange.fire()
    }

    // ── Public API ──────────────────────────────────────────────────────────────

    async list(endpointKey: string): Promise<TestCase[]> {
        await this._load()
        return this._data.cases[endpointKey] ?? []
    }

    async get(endpointKey: string, name: string): Promise<TestCase | undefined> {
        await this._load()
        return (this._data.cases[endpointKey] ?? []).find(c => c.name === name)
    }

    // Upsert by name — saving a case with an existing name overwrites it.
    async save(endpointKey: string, testCase: TestCase): Promise<void> {
        await this._load()
        const existing = this._data.cases[endpointKey] ?? []
        const idx      = existing.findIndex(c => c.name === testCase.name)

        if (idx === -1) existing.push(testCase)
        else            existing[idx] = testCase

        this._data.cases[endpointKey] = existing
        await this._persist()
    }

    async delete(endpointKey: string, name: string): Promise<void> {
        await this._load()
        const existing = this._data.cases[endpointKey]
        if (!existing) return

        const filtered = existing.filter(c => c.name !== name)
        if (filtered.length > 0) this._data.cases[endpointKey] = filtered
        else                     delete this._data.cases[endpointKey]

        await this._persist()
    }

    dispose() { this._onDidChange.dispose() }
}
