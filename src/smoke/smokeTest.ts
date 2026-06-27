/**
 * smokeTest.ts
 * Run-all Phase 2 — fire saved cases across a module or the whole API surface
 * and stream pass/fail into a dedicated results panel.
 *
 * Safe by construction: only saved cases run (the dev created them on purpose),
 * plus uncased GETs if opted in. Write methods are excluded unless explicitly
 * included, and a modal confirm always precedes a run that touches them.
 */

import * as vscode              from 'vscode'
import { ApiEndpoint }          from '../types/endpoint'
import { EndpointTreeProvider } from '../explorer/endpointTreeProvider'
import { CasesStore, TestCase } from '../cases/casesStore'
import { ConfigManager }        from '../config/configManager'
import { AuthStore }            from '../auth/authStore'
import { endpointBelongsTo }    from '../explorer/inferModule'
import { buildRequestFromCase, executeRequest } from '../request/executeRequest'

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

type Scope = { kind: 'all' } | { kind: 'module'; modulePath: string[] }

interface RunItem {
    endpoint:  ApiEndpoint
    testCase:  TestCase
    caseLabel: string
}

export function registerSmokeTest(
    context:      vscode.ExtensionContext,
    treeProvider: EndpointTreeProvider,
    cases:        CasesStore,
    config:       ConfigManager,
    authStore:    AuthStore,
): vscode.Disposable[] {

    const deps = { context, treeProvider, cases, config, authStore }

    return [
        vscode.commands.registerCommand('apiExplorer.runAll', () =>
            runScope(deps, { kind: 'all' })),

        vscode.commands.registerCommand('apiExplorer.runModule', (item: any) =>
            runScope(deps, { kind: 'module', modulePath: item?.modulePath ?? [] })),
    ]
}

interface Deps {
    context:      vscode.ExtensionContext
    treeProvider: EndpointTreeProvider
    cases:        CasesStore
    config:       ConfigManager
    authStore:    AuthStore
}

async function runScope(deps: Deps, scope: Scope): Promise<void> {
    const { treeProvider, cases, config, authStore, context } = deps

    const all = treeProvider.endpoints
    if (!all.length) {
        vscode.window.showWarningMessage('Zerk: No endpoints loaded — connect to a server first.')
        return
    }

    const inScope = scope.kind === 'all'
        ? all
        : all.filter(e => endpointBelongsTo(e.path, scope.modulePath))

    // ── Options ───────────────────────────────────────────────────────────────
    type Opt = vscode.QuickPickItem & { _id: string }
    const picks = await vscode.window.showQuickPick<Opt>([
        { label: 'Include GET endpoints without a saved case', _id: 'uncasedGets', picked: true },
        { label: 'Include write methods (POST/PUT/PATCH/DELETE)', _id: 'writeMethods', picked: false },
    ], { canPickMany: true, title: 'Smoke test — what to include', placeHolder: 'Adjust, then press Enter' })

    if (!picks) return
    const includeUncasedGets = picks.some(p => p._id === 'uncasedGets')
    const includeWrite       = picks.some(p => p._id === 'writeMethods')

    // ── Build the run set ───────────────────────────────────────────────────────
    const items: RunItem[] = []
    for (const e of inScope) {
        if (WRITE_METHODS.includes(e.method) && !includeWrite) continue

        const saved = await cases.list(`${e.method}:${e.path}`)
        if (saved.length) {
            for (const c of saved) items.push({ endpoint: e, testCase: c, caseLabel: c.name })
        } else if (e.method === 'GET' && includeUncasedGets && !e.path.includes('{')) {
            items.push({ endpoint: e, testCase: { name: '(default)' }, caseLabel: '(default)' })
        }
    }

    if (!items.length) {
        vscode.window.showInformationMessage(
            'Zerk: Nothing to run in scope — no saved cases and no eligible GET endpoints.'
        )
        return
    }

    const writeCount = items.filter(i => WRITE_METHODS.includes(i.endpoint.method)).length
    const confirm = await vscode.window.showWarningMessage(
        `Fire ${items.length} request(s)${writeCount ? ` (${writeCount} write — may modify data)` : ''} against ${config.baseUrl}?`,
        { modal: true }, 'Run'
    )
    if (confirm !== 'Run') return

    // ── Run sequentially, streaming into the panel ─────────────────────────────
    const scopeLabel = scope.kind === 'all' ? 'All endpoints' : '/' + scope.modulePath.join('/')
    const panel = SmokePanel.show(context, treeProvider)
    panel.start(scopeLabel, items.length)

    let passed = 0, failed = 0
    for (const item of items) {
        try {
            const req = buildRequestFromCase(item.endpoint, item.testCase, config.baseUrl)
            const r   = await executeRequest(req, config, authStore)
            const ok  = r.status >= 200 && r.status < 300
            ok ? passed++ : failed++
            panel.addRow({
                method:     item.endpoint.method,
                path:       item.endpoint.path,
                caseLabel:  item.caseLabel,
                status:     r.status,
                statusText: r.statusText,
                elapsed:    r.elapsed,
                ok,
                body:       typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2),
            })
        } catch (err: any) {
            failed++
            panel.addRow({
                method:     item.endpoint.method,
                path:       item.endpoint.path,
                caseLabel:  item.caseLabel,
                status:     0,
                statusText: 'error',
                elapsed:    0,
                ok:         false,
                body:       String(err?.message ?? err),
            })
        }
    }

    panel.done()
}

// ── Results panel ──────────────────────────────────────────────────────────────

interface ResultRow {
    method: string; path: string; caseLabel: string
    status: number; statusText: string; elapsed: number; ok: boolean
    body:   string
}

class SmokePanel {

    private static _current?: SmokePanel
    private readonly _panel: vscode.WebviewPanel

    private constructor(panel: vscode.WebviewPanel, treeProvider: EndpointTreeProvider) {
        this._panel = panel
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'openEndpoint') {
                const ep = treeProvider.endpoints.find(e => e.method === msg.method && e.path === msg.path)
                if (ep) vscode.commands.executeCommand('apiExplorer.openRequest', ep)
            }
        })
        panel.onDidDispose(() => {
            if (SmokePanel._current?._panel === panel) SmokePanel._current = undefined
        })
    }

    static show(context: vscode.ExtensionContext, treeProvider: EndpointTreeProvider): SmokePanel {
        if (SmokePanel._current) {
            SmokePanel._current._panel.reveal(vscode.ViewColumn.Active)
            return SmokePanel._current
        }
        const panel = vscode.window.createWebviewPanel(
            'apiExplorerSmoke', 'API Smoke Test', vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true }
        )
        panel.webview.html = SMOKE_HTML
        SmokePanel._current = new SmokePanel(panel, treeProvider)
        return SmokePanel._current
    }

    start(scope: string, total: number) {
        this._panel.title = `Smoke Test — ${scope}`
        this._panel.webview.postMessage({ type: 'start', scope, total })
    }
    addRow(row: ResultRow) { this._panel.webview.postMessage({ type: 'row', row }) }
    done()                 { this._panel.webview.postMessage({ type: 'done' }) }
}

const SMOKE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;background:#1e1e1e;color:#ccc;display:flex;flex-direction:column;height:100vh;overflow:hidden}
.head{padding:20px 24px 14px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}
.title{font-size:15px;font-weight:600;margin-bottom:6px}
.summary{font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;font-weight:700}
.summary .pass{color:#10b981}.summary .fail{color:#f43f5e}.summary .run{color:rgba(204,204,204,.4);font-weight:400}
.panes{display:flex;flex:1;min-height:0}
.list{width:46%;min-width:300px;overflow-y:auto;border-right:1px solid rgba(255,255,255,.08);padding:14px}
.detail{flex:1;overflow-y:auto;padding:18px 22px;min-width:0}
.group{margin-bottom:14px}
.ghead{display:flex;align-items:center;gap:10px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;padding:4px 6px;margin-bottom:2px}
.ghead .method{font-weight:700;flex-shrink:0}
.ghead .gpath{color:rgba(204,204,204,.7);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ghead .groll{font-weight:700;flex-shrink:0}.ghead .groll.ok{color:#10b981}.ghead .groll.bad{color:#f43f5e}
.case-row{display:flex;align-items:center;gap:10px;padding:6px 8px 6px 18px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;cursor:pointer;border-left:2px solid transparent;transition:background .1s}
.case-row:hover{background:#252526}
.case-row.sel{background:#2d2d30;border-left-color:#3b82f6}
.case-row .mark{flex-shrink:0;font-weight:700;width:10px}
.case-row .cname{flex:1;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.case-row .cstatus{color:rgba(204,204,204,.6);flex-shrink:0}
.case-row .cms{color:rgba(204,204,204,.3);flex-shrink:0;width:54px;text-align:right}
.dhead{display:flex;align-items:center;gap:10px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;margin-bottom:10px}
.dhead .method{font-weight:700;flex-shrink:0}.dhead .dpath{color:#ccc}
.dhead .dcase{color:rgba(204,204,204,.5)}
.openbtn{margin-left:auto;background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(204,204,204,.6);font-family:inherit;font-size:10px;padding:3px 9px;cursor:pointer;flex-shrink:0}
.openbtn:hover{color:#ccc;border-color:rgba(255,255,255,.35)}
.dmeta{font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;font-weight:700;padding:2px 8px;display:inline-block;margin-bottom:12px}
.s2xx{border:1px solid #10b981;color:#10b981}.s3xx{border:1px solid #f59e0b;color:#f59e0b}
.s4xx{border:1px solid #f97316;color:#f97316}.s5xx{border:1px solid #f43f5e;color:#f43f5e}
.dbody{background:#252526;border:1px solid rgba(255,255,255,.08);font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;padding:12px;line-height:1.6;white-space:pre;overflow-x:auto}
.jk{color:#9cdcfe}.js{color:#ce9178}.jn{color:#b5cea8}.jb{color:#569cd6}
.empty{color:rgba(204,204,204,.3);font-style:italic;padding:12px 0}
</style></head><body>
<div class="head"><div class="title" id="title">Smoke Test</div><div class="summary" id="summary"></div></div>
<div class="panes">
  <div class="list" id="list"></div>
  <div class="detail" id="detail"><div class="empty">Select a result to view its response</div></div>
</div>
<script>
const vscode = acquireVsCodeApi()
const COLORS = { GET:'#10b981', POST:'#3b82f6', PUT:'#f59e0b', PATCH:'#a78bfa', DELETE:'#f43f5e' }
let total=0, passed=0, failed=0, running=false, selectedId=-1
const results=[]
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function highlight(json){
  return esc(json).replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, m=>{
    let c='jn'; if(/^"/.test(m)) c=/:$/.test(m)?'jk':'js'; else if(/true|false|null/.test(m)) c='jb'; return '<span class="'+c+'">'+m+'</span>'
  })
}
function renderSummary(){
  const ran=passed+failed
  document.getElementById('summary').innerHTML='<span class="pass">'+passed+' passed</span>'
    +(failed?' \\u00b7 <span class="fail">'+failed+' failed</span>':'')
    +' \\u00b7 '+ran+'/'+total+(running?' \\u00b7 <span class="run">running\\u2026</span>':' total')
}
function renderList(){
  const groups={}, order=[]
  results.forEach(r=>{ const k=r.method+' '+r.path; if(!groups[k]){groups[k]=[];order.push(k)} groups[k].push(r) })
  let html=''
  order.forEach(k=>{
    const g=groups[k], pass=g.filter(x=>x.ok).length, allok=pass===g.length
    html+='<div class="group"><div class="ghead">'
      +'<span class="method" style="color:'+(COLORS[g[0].method]||'#ccc')+'">'+esc(g[0].method)+'</span>'
      +'<span class="gpath">'+esc(g[0].path)+'</span>'
      +'<span class="groll '+(allok?'ok':'bad')+'">'+pass+'/'+g.length+'</span></div>'
    g.forEach(r=>{
      html+='<div class="case-row'+(r.id===selectedId?' sel':'')+'" onclick="select('+r.id+')">'
        +'<span class="mark" style="color:'+(r.ok?'#10b981':'#f43f5e')+'">'+(r.ok?'\\u2713':'\\u2717')+'</span>'
        +'<span class="cname">'+esc(r.caseLabel)+'</span>'
        +'<span class="cstatus">'+(r.status||'\\u2014')+'</span>'
        +'<span class="cms">'+(r.elapsed||0)+'ms</span></div>'
    })
    html+='</div>'
  })
  document.getElementById('list').innerHTML=html
}
function select(id){ selectedId=id; renderList(); renderDetail() }
function renderDetail(){
  const r=results.find(x=>x.id===selectedId), d=document.getElementById('detail')
  if(!r){ d.innerHTML='<div class="empty">Select a result to view its response</div>'; return }
  const cls=r.status>=500?'s5xx':r.status>=400?'s4xx':r.status>=300?'s3xx':'s2xx'
  d.innerHTML='<div class="dhead">'
    +'<span class="method" style="color:'+(COLORS[r.method]||'#ccc')+'">'+esc(r.method)+'</span>'
    +'<span class="dpath">'+esc(r.path)+'</span><span class="dcase">'+esc(r.caseLabel)+'</span>'
    +'<button class="openbtn" onclick="openSelected()">\\u2197 Open in request panel</button></div>'
    +'<div class="dmeta '+cls+'">'+(r.status||'\\u2014')+' '+esc(r.statusText||'')+' \\u00b7 '+(r.elapsed||0)+'ms</div>'
    +'<div class="dbody">'+highlight(r.body||'')+'</div>'
}
function openSelected(){ const r=results.find(x=>x.id===selectedId); if(r) vscode.postMessage({type:'openEndpoint',method:r.method,path:r.path}) }
window.addEventListener('message', e=>{
  const m=e.data
  if(m.type==='start'){ total=m.total; passed=0; failed=0; running=true; selectedId=-1; results.length=0
    document.getElementById('title').textContent='Smoke Test \\u2014 '+m.scope
    document.getElementById('detail').innerHTML='<div class="empty">Select a result to view its response</div>'
    renderList(); renderSummary() }
  else if(m.type==='row'){ const r=m.row; r.id=results.length; r.ok?passed++:failed++; results.push(r); renderList(); renderSummary() }
  else if(m.type==='done'){ running=false; renderSummary() }
})
</script></body></html>`
