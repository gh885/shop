#!/usr/bin/env node
// 模块图闭环检查：读每个模块目录下 README.md 的 yaml 块，核四件事。
//
//   1. schema 唯一（模块 = 顶层包 = schema，三者一对一）
//   2. depends_on 指向真实存在的模块
//   3. 模块级依赖无环
//   4. 事件双向闭合：发出去的有人收，收进来的有人发
//
// 前三件是硬错，发现问题退出码非零；第四件目前大量未定，只报告不判失败——
// 判失败就逼着人把「还没设计」写成「已经设计了」，那比缺口本身更坏。

import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

const BASE = "apps/server/src/main/java/com/shop/platform"
const FENCE = "```"

function parseList(raw) {
    const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "")
    if (!inner.trim()) return []
    return inner
        .split(",")
        .map((item) => item.trim().replace(/^["']/, "").replace(/["']$/, ""))
        .filter(Boolean)
}

function parseBlock(markdown) {
    const lines = markdown.split(/\r?\n/)
    const start = lines.findIndex((line) => line.trim() === FENCE + "yaml")
    if (start < 0) return null
    const end = lines.findIndex((line, index) => index > start && line.trim() === FENCE)
    if (end < 0) return null

    const fields = {}
    for (const line of lines.slice(start + 1, end)) {
        const match = line.match(/^([a-z_]+):\s*(.*)$/)
        if (match) fields[match[1]] = match[2]
    }
    return {
        name: fields.module,
        layer: fields.layer,
        schema: fields.schema,
        status: fields.status,
        dependsOn: parseList(fields.depends_on ?? ""),
        emits: parseList(fields.emits ?? ""),
        consumes: parseList(fields.consumes ?? ""),
    }
}

async function loadModules() {
    const dirs = await readdir(BASE, { withFileTypes: true })
    const modules = []
    for (const dir of dirs) {
        if (!dir.isDirectory()) continue
        if (dir.name === "common" || dir.name === "infra") continue
        let markdown
        try {
            markdown = await readFile(join(BASE, dir.name, "README.md"), "utf8")
        } catch {
            modules.push({ name: dir.name, broken: "目录存在但没有 README.md" })
            continue
        }
        const parsed = parseBlock(markdown)
        if (!parsed) {
            modules.push({ name: dir.name, broken: "README.md 里没有 yaml 块" })
            continue
        }
        modules.push(parsed)
    }
    return modules
}

function findCycles(modules) {
    const byName = new Map(modules.filter((m) => !m.broken).map((m) => [m.name, m]))
    const cycles = []
    const state = new Map()

    function visit(name, path) {
        const current = state.get(name)
        if (current === "done") return
        if (current === "open") {
            cycles.push([...path.slice(path.indexOf(name)), name].join(" → "))
            return
        }
        state.set(name, "open")
        for (const dep of byName.get(name)?.dependsOn ?? []) {
            const target = dep.split("::")[0].trim()
            if (byName.has(target)) visit(target, [...path, name])
        }
        state.set(name, "done")
    }

    for (const module of byName.values()) visit(module.name, [])
    return cycles
}

const modules = await loadModules()
const healthy = modules.filter((m) => !m.broken)
const broken = modules.filter((m) => m.broken)

const out = []
out.push(
    `模块总数 ${modules.length}（已实现 ${healthy.filter((m) => m.status === "implemented").length}，` +
        `未开工 ${healthy.filter((m) => m.status === "not-started").length}）`,
)

const byLayer = new Map()
for (const module of healthy) byLayer.set(module.layer, (byLayer.get(module.layer) ?? 0) + 1)
out.push(`分层：${[...byLayer].map(([layer, count]) => `${layer} ${count}`).join(" · ")}`)

const problems = []
for (const module of broken) problems.push(`${module.name}：${module.broken}`)

const schemas = new Map()
for (const module of healthy) {
    if (!module.schema || module.schema === "-") problems.push(`${module.name}：没有 schema`)
    else if (schemas.has(module.schema)) {
        problems.push(
            `schema 冲突：${module.name} 与 ${schemas.get(module.schema)} 都声明了 ${module.schema}`,
        )
    } else schemas.set(module.schema, module.name)
}

const names = new Set(healthy.map((m) => m.name))
for (const module of healthy) {
    for (const dep of module.dependsOn) {
        const target = dep.split("::")[0].trim()
        if (target === module.name) problems.push(`${module.name}：依赖了自己`)
        else if (!names.has(target))
            problems.push(`${module.name}：depends_on 指向不存在的模块 ${target}`)
    }
}

const cycles = findCycles(healthy)
for (const cycle of cycles) problems.push(`依赖成环：${cycle}`)

const producers = new Map()
const consumers = new Map()
for (const module of healthy) {
    for (const event of module.emits)
        producers.set(event, [...(producers.get(event) ?? []), module.name])
    for (const event of module.consumes)
        consumers.set(event, [...(consumers.get(event) ?? []), module.name])
}

const events = new Set([...producers.keys(), ...consumers.keys()])
const orphanProduced = [...events]
    .filter((e) => producers.has(e) && !consumers.has(e))
    .sort((a, b) => a.localeCompare(b))
const orphanConsumed = [...events]
    .filter((e) => consumers.has(e) && !producers.has(e))
    .sort((a, b) => a.localeCompare(b))

out.push("")
out.push(`事件共 ${events.size} 个：有生产者 ${producers.size}，有消费者 ${consumers.size}`)
if (orphanProduced.length) {
    out.push(`  发了没人收（${orphanProduced.length}）：`)
    for (const event of orphanProduced)
        out.push(`    ${event}  ← ${producers.get(event).join(", ")}`)
}
if (orphanConsumed.length) {
    out.push(`  收了没人发（${orphanConsumed.length}）：`)
    for (const event of orphanConsumed)
        out.push(`    ${event}  → ${consumers.get(event).join(", ")}`)
}

if (problems.length) {
    out.push("")
    out.push(`结构问题 ${problems.length}：`)
    for (const problem of problems) out.push(`  ${problem}`)
}

console.log(out.join("\n"))
process.exit(problems.length ? 1 : 0)
