/**
 * styles.ts
 * CSS for the request panel webview.
 * Accepts the method accent color so each panel is themed to its HTTP method.
 */

export function getStyles(color: string): string {
    return `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;background:#1e1e1e;color:#cccccc;display:flex;flex-direction:column;height:100vh;overflow:hidden}
    .scroll-area{flex:1;overflow-y:auto;min-height:0;padding:24px}
    .inner{max-width:1400px;margin:0 auto}

    /* ── Two-pane layout: inputs left, response right (collapses on narrow panels) ── */
    .panes{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:36px;align-items:start}
    .panes.single{grid-template-columns:minmax(0,1fr)}
    .pane{min-width:0}
    @media (max-width:900px){.panes{grid-template-columns:minmax(0,1fr);gap:0}}

    /* ── Header ── */
    .header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
    .method-badge{font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border:1px solid ${color};background:${color}12;color:${color};white-space:nowrap;flex-shrink:0}
    .endpoint-path{font-family:'JetBrains Mono','Fira Code',monospace;font-size:14px;font-weight:600;color:#cccccc;flex:1;min-width:0}
    .copy-btn{background:transparent;border:none;cursor:pointer;color:rgba(204,204,204,.4);padding:4px;display:flex;align-items:center;transition:color .1s;flex-shrink:0}
    .copy-btn:hover{color:rgba(204,204,204,.8)}
    .copy-btn.copied{color:#10b981}
    .summary{font-size:12px;color:rgba(204,204,204,.5);margin-bottom:24px;margin-top:-16px}

    /* ── Base URL strip ── */
    .base-url-strip{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#252526;border:1px solid rgba(255,255,255,.08);margin-bottom:24px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px}
    .base-url-tag{font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:9px;color:rgba(204,204,204,.35)}
    .base-url-value{color:#cccccc;flex:1}
    .base-url-hint{font-size:9px;color:rgba(204,204,204,.25)}

    /* ── Cases bar ── */
    .cases-bar{display:flex;align-items:center;gap:8px;margin-bottom:24px;margin-top:-12px;font-family:'JetBrains Mono','Fira Code',monospace}
    .cases-tag{font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:9px;color:rgba(204,204,204,.35);flex-shrink:0}
    .cases-select{background:#252526;border:1px solid rgba(255,255,255,.1);color:#cccccc;font-family:inherit;font-size:11px;padding:3px 6px;outline:none;min-width:160px;max-width:280px}
    .cases-select:focus{border-color:${color}}
    .cases-btn{background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(204,204,204,.5);font-family:inherit;font-size:10px;padding:3px 8px;cursor:pointer;transition:all .1s;flex-shrink:0}
    .cases-btn:hover{color:#ccc;border-color:rgba(255,255,255,.3)}
    .cases-del:hover{color:#f43f5e;border-color:#f43f5e60}

    /* ── Sections ── */
    .section{margin-bottom:28px}
    .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(204,204,204,.5);margin-bottom:10px}

    /* ── Params ── */
    .param-list{display:flex;flex-direction:column;gap:8px}
    .param-row{display:grid;grid-template-columns:140px 1fr;align-items:center;gap:10px}
    .param-label{font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;color:rgba(204,204,204,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .required{color:#f43f5e;margin-left:2px}
    .param-input{background:#3c3c3c;border:1px solid rgba(255,255,255,.1);color:#cccccc;font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;padding:5px 8px;outline:none;width:100%;transition:border-color .1s}
    .param-input:focus{border-color:${color}}
    .param-input::placeholder{color:rgba(204,204,204,.2)}

    /* ── Code blocks ── */
    .code-block{background:#252526;border:1px solid rgba(255,255,255,.08);color:rgba(204,204,204,.85);font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;padding:12px;line-height:1.6;display:block;outline:none;transition:border-color .1s}
    textarea.code-block:focus{border-color:rgba(255,255,255,.2)}
    .response-pre{white-space:pre;overflow-x:auto;max-height:400px;overflow-y:auto}

    /* ── Schema preview (read-only) ── */
    .schema-preview{background:#1e1e2e;border:1px solid rgba(255,255,255,.06);color:rgba(204,204,204,.5);font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;padding:10px 12px;line-height:1.6;white-space:pre;overflow-x:auto;max-height:200px;overflow-y:auto}
    .schema-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(204,204,204,.25);margin-bottom:5px}

    /* ── Response ── */
    .response-meta{display:flex;align-items:center;gap:10px;margin-bottom:10px}
    .status-badge{font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;font-weight:700;padding:2px 8px}
    .s2xx{border:1px solid #10b981;background:#10b98112;color:#10b981}
    .s3xx{border:1px solid #f59e0b;background:#f59e0b12;color:#f59e0b}
    .s4xx{border:1px solid #f97316;background:#f9731612;color:#f97316}
    .s5xx{border:1px solid #f43f5e;background:#f43f5e12;color:#f43f5e}
    .elapsed{font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;color:rgba(204,204,204,.35)}
    .restored-tag{font-family:'JetBrains Mono','Fira Code',monospace;font-size:9px;padding:1px 5px;border:1px solid rgba(204,204,204,.15);color:rgba(204,204,204,.3)}
    .placeholder{color:rgba(204,204,204,.2);font-size:12px;font-style:italic;padding:16px 0}
    .error-block{padding:10px 12px;background:#f43f5e12;border:1px solid #f43f5e40;color:#f43f5e;font-size:12px}

    /* ── JSON syntax colors ── */
    .jk{color:#9cdcfe}.js{color:#ce9178}.jn{color:#b5cea8}.jb{color:#569cd6}

    /* ── Footer ── */
    .footer{flex-shrink:0;padding:14px 24px;border-top:1px solid rgba(255,255,255,.08);background:#1e1e1e}
    .send-btn{display:inline-flex;align-items:center;gap:7px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;font-weight:600;padding:7px 16px;background:${color};color:#1e1e1e;border:none;cursor:pointer;transition:opacity .1s;letter-spacing:.02em}
    .send-btn:hover:not(:disabled){opacity:.85}
    .send-btn:disabled{opacity:.4;cursor:not-allowed}
    `
}