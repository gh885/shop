import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import * as generatedSchemas from "@shop/api/schemas"
import { z } from "zod"

/** 验证生成器保留约束，不再维护「前端常量名 ↔ Java 常量名」清单。 */
const contract = z
    .object({
        components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
    })
    .parse(
        JSON.parse(
            readFileSync(new URL("../../../../openapi/api-docs.json", import.meta.url), "utf8"),
        ),
    )
const generated: Record<string, unknown> = generatedSchemas
const constraintKeys = new Set([
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "minProperties",
    "maxProperties",
    "multipleOf",
    "pattern",
    "required",
    "enum",
    "$ref",
])

type Constraint = { path: string[]; value: unknown }

function isObject(value: unknown): value is Record<string, unknown> | unknown[] {
    return value !== null && typeof value === "object"
}

function constraints(value: unknown, path: string[] = []): Constraint[] {
    if (!isObject(value)) return []
    return Object.entries(value).flatMap(([key, child]) => {
        const childPath = [...path, key]
        return constraintKeys.has(key)
            ? [{ path: childPath, value: child }]
            : constraints(child, childPath)
    })
}

function valueAt(value: unknown, path: string[]): unknown {
    for (const key of path) {
        if (!isObject(value)) return undefined
        value = Array.isArray(value) ? value[Number(key)] : value[key]
    }
    return value
}

describe("生成的表单约束", () => {
    it("扫描覆盖真实契约，不能空跑", () => {
        expect(Object.keys(contract.components.schemas).length).toBeGreaterThan(0)
        expect(
            Object.values(contract.components.schemas).flatMap((s) => constraints(s)).length,
        ).toBeGreaterThan(0)
        expect(Object.keys(generated).toSorted()).toEqual(
            Object.keys(contract.components.schemas)
                .map((name) => name + "Schema")
                .toSorted(),
        )
    })

    it.each(Object.entries(contract.components.schemas))(
        "%s 的约束与 OpenAPI 一致",
        (name, schema) => {
            const actual = generated[name + "Schema"]
            expect(actual).toBeDefined()
            for (const constraint of constraints(schema)) {
                expect({
                    path: [name, ...constraint.path],
                    value: valueAt(actual, constraint.path),
                }).toEqual({ path: [name, ...constraint.path], value: constraint.value })
            }
        },
    )

    it("扫描保留数组元素、零下限和独占边界，并能识别丢失的约束", () => {
        const schema = {
            properties: {
                items: {
                    minItems: 0,
                    items: {
                        maxLength: 4,
                        exclusiveMinimum: 0,
                    },
                },
            },
        }
        expect(constraints(schema)).toEqual([
            { path: ["properties", "items", "minItems"], value: 0 },
            { path: ["properties", "items", "items", "maxLength"], value: 4 },
            { path: ["properties", "items", "items", "exclusiveMinimum"], value: 0 },
        ])
        expect(valueAt(schema, ["properties", "items", "items", "maxLength"])).toBe(4)
        expect(valueAt({}, ["properties", "items", "items", "maxLength"])).toBeUndefined()
    })
})
