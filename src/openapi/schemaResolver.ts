/**
 * schemaResolver.ts
 * Resolves $ref pointers and builds sample values from JSON Schema objects.
 */

export interface SchemaComponents {
    schemas?: Record<string, any>
}

export function resolveSchema(schema: any, components: SchemaComponents): any {
    if (!schema) return schema

    if (schema.$ref) {
        const match = schema.$ref.match(/^#\/components\/schemas\/(.+)$/)
        if (!match) return {}
        const resolved = components.schemas?.[match[1]]
        if (!resolved) return {}
        return resolveSchema(resolved, components)
    }

    if (schema.allOf) {
        return schema.allOf.reduce((acc: any, sub: any) =>
            mergeSchemas(acc, resolveSchema(sub, components)), {})
    }

    if (schema.anyOf || schema.oneOf) {
        return resolveSchema((schema.anyOf ?? schema.oneOf)[0], components)
    }

    return schema
}

function mergeSchemas(a: any, b: any): any {
    return {
        ...a, ...b,
        properties: { ...(a.properties ?? {}), ...(b.properties ?? {}) },
        required:   [...(a.required ?? []),    ...(b.required ?? [])],
    }
}

export function buildSample(schema: any, components: SchemaComponents, depth = 0): any {
    if (!schema || depth > 6) return null

    const resolved = resolveSchema(schema, components)
    if (!resolved) return null

    if (resolved.example !== undefined) return resolved.example
    if (resolved.default !== undefined) return resolved.default

    const type = resolved.type

    if (type === "object" || resolved.properties) {
        const result: Record<string, any> = {}
        for (const [key, val] of Object.entries<any>(resolved.properties ?? {})) {
            result[key] = buildSample(val, components, depth + 1)
        }
        return result
    }

    if (type === "array") {
        return resolved.items ? [buildSample(resolved.items, components, depth + 1)] : []
    }

    if (resolved.enum?.length) return resolved.enum[0]

    switch (type) {
        case "string":
            if (resolved.format === "date-time") return new Date().toISOString()
            if (resolved.format === "date")      return new Date().toISOString().split("T")[0]
            if (resolved.format === "email")     return "user@example.com"
            if (resolved.format === "uuid")      return "00000000-0000-0000-0000-000000000000"
            if (resolved.format === "uri")       return "https://example.com"
            return resolved.title
                ? resolved.title.toLowerCase().replace(/\s+/g, "_")
                : "string"
        case "integer":
        case "number":  return resolved.minimum ?? 0
        case "boolean": return false
        default:        return null
    }
}

/**
 * Picks the content type the panel should author/send for a request body.
 * Prefers JSON, then form-urlencoded, then multipart, else whatever's first.
 */
export function getRequestContentType(requestBody: any): string | undefined {
    const content = requestBody?.content
    if (!content) return undefined
    const preferred = [
        "application/json",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
    ]
    return preferred.find(c => content[c]) ?? Object.keys(content)[0]
}

/**
 * For form bodies (urlencoded / multipart) we blank out string fields instead
 * of filling dummy values like "string" — sending those would fail server-side
 * validation (e.g. OAuth2's grant_type pattern). The user fills what they need.
 */
function buildFormSample(schema: any, components: SchemaComponents): any {
    const resolved = resolveSchema(schema, components)
    const props    = resolved?.properties ?? {}
    const result: Record<string, any> = {}
    for (const [key, val] of Object.entries<any>(props)) {
        const r = resolveSchema(val, components)
        result[key] = r?.example ?? r?.default ?? ""
    }
    return result
}

export function buildRequestBodyTemplate(requestBody: any, components: SchemaComponents): string {
    try {
        const contentType = getRequestContentType(requestBody)
        if (!contentType) return "{}"

        const schema = requestBody.content[contentType]?.schema
        if (!schema) return "{}"

        const isForm = contentType.includes("form-urlencoded") || contentType.includes("form-data")
        const sample = isForm
            ? buildFormSample(schema, components)
            : buildSample(schema, components)

        return sample !== null ? JSON.stringify(sample, null, 2) : "{}"
    } catch {
        return "{}"
    }
}

export function buildResponseBodyTemplate(responses: any, components: SchemaComponents): string {
    try {
        // Prefer 200, then 201, then first available success code
        const successCode = ["200", "201", "204"].find(c => responses?.[c])
            ?? Object.keys(responses ?? {}).find(c => c.startsWith("2"))

        if (!successCode) return ""

        const schema = responses[successCode]?.content?.["application/json"]?.schema
        if (!schema) return ""

        const sample = buildSample(schema, components)
        console.log('Sample: ', sample)
        return sample !== null ? JSON.stringify(sample, null, 2) : ""
    } catch {
        return ""
    }
}