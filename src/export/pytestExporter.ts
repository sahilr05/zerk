/**
 * pytestExporter.ts
 * Turns saved cases (already fired, with their real responses captured) into a
 * runnable pytest file using httpx. Pure string generation: no vscode, no I/O.
 *
 * The generated file reads BASE_URL and the bearer token from environment
 * variables, so a real secret is never written into a committable test.
 */

import { ApiEndpoint }           from "../types/endpoint"
import { TestCase }              from "../core/types"
import { getRequestContentType } from "../openapi/schemaResolver"

export interface FiredCase {
    endpoint: ApiEndpoint
    testCase: TestCase
    status:   number      // the status the request actually returned
    response: any         // the parsed response body (object / array / string)
}

// ── Python literal helpers ──────────────────────────────────────────────────

function pyStr(s: string): string {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"'
}

function pyLiteral(value: any, indent: number): string {
    const pad    = "    ".repeat(indent)
    const padEnd = "    ".repeat(indent - 1)

    if (value === null || value === undefined) return "None"
    if (typeof value === "boolean") return value ? "True" : "False"
    if (typeof value === "number")  return String(value)
    if (typeof value === "string")  return pyStr(value)

    if (Array.isArray(value)) {
        if (value.length === 0) return "[]"
        const items = value.map(v => pad + pyLiteral(v, indent + 1)).join(",\n")
        return "[\n" + items + "\n" + padEnd + "]"
    }

    if (typeof value === "object") {
        const keys = Object.keys(value)
        if (keys.length === 0) return "{}"
        const items = keys
            .map(k => pad + pyStr(k) + ": " + pyLiteral(value[k], indent + 1))
            .join(",\n")
        return "{\n" + items + "\n" + padEnd + "}"
    }
    return "None"
}

// ── Name / path helpers ─────────────────────────────────────────────────────

function slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x"
}

function relPathFor(endpoint: ApiEndpoint, testCase: TestCase): string {
    let path = endpoint.path
    for (const [k, v] of Object.entries(testCase.pathParams ?? {})) {
        path = path.replace(`{${k}}`, encodeURIComponent(v))
    }
    return path
}

function nonEmptyQuery(testCase: TestCase): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(testCase.queryParams ?? {})) {
        if (v !== "" && v != null) out[k] = v
    }
    return out
}

// ── Single test ─────────────────────────────────────────────────────────────

function renderTest(fired: FiredCase, usedNames: Set<string>): string {
    const { endpoint, testCase, status, response } = fired
    const method  = endpoint.method.toLowerCase()
    const relPath = relPathFor(endpoint, testCase)

    // Unique python identifier for the test function.
    let name = `test_${slug(method)}_${slug(relPath)}_${slug(testCase.name)}`
    let n = name
    let i = 2
    while (usedNames.has(n)) { n = `${name}_${i++}` }
    usedNames.add(n)

    const lines: string[] = []
    lines.push(`def ${n}():`)

    const args: string[] = [`f"{BASE_URL}${relPath}"`, `headers=_headers()`]

    const query = nonEmptyQuery(testCase)
    if (Object.keys(query).length) args.push(`params=${pyLiteral(query, 3)}`)

    const hasBody     = ["POST", "PUT", "PATCH"].includes(endpoint.method)
    const contentType = (hasBody && getRequestContentType(endpoint.requestBody)) || "application/json"
    const isForm      = contentType.includes("form-urlencoded") || contentType.includes("form-data")

    if (hasBody && testCase.body) {
        try {
            const parsed = JSON.parse(testCase.body)
            if (isForm) args.push(`data=${pyLiteral(parsed, 3)}`)
            else        args.push(`json=${pyLiteral(parsed, 3)}`)
        } catch {
            args.push(`content=${pyStr(testCase.body)}`)
        }
    }

    lines.push(`    resp = httpx.${method}(`)
    for (const a of args) lines.push(`        ${a},`)
    lines.push(`    )`)
    lines.push(`    assert resp.status_code == ${status}`)

    // Snapshot light assertions from the real response, without being brittle:
    // presence of top-level keys for an object, type for a list.
    if (response && typeof response === "object" && !Array.isArray(response)) {
        lines.push(`    data = resp.json()`)
        for (const key of Object.keys(response)) {
            lines.push(`    assert ${pyStr(key)} in data`)
        }
    } else if (Array.isArray(response)) {
        lines.push(`    assert isinstance(resp.json(), list)`)
    }

    return lines.join("\n")
}

// ── Whole file ──────────────────────────────────────────────────────────────

export function generatePytest(fired: FiredCase[], baseUrl: string): string {
    const usedNames = new Set<string>()
    const tests = fired.map(f => renderTest(f, usedNames)).join("\n\n\n")

    return `"""
Generated by Zerk from your saved API cases.

Run:        pytest ${"this_file.py"}
Configure:  ZERK_BASE_URL   (default: ${baseUrl})
            ZERK_TOKEN      (bearer token, optional)

Assertions are a snapshot of what your API returned when this file was generated:
the status code, plus the presence of top-level response keys. Tighten them as needed.
"""
import os

import httpx
import pytest

BASE_URL = os.environ.get("ZERK_BASE_URL", ${pyStr(baseUrl)})
TOKEN = os.environ.get("ZERK_TOKEN")


def _headers():
    return {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}


${tests}
`
}
