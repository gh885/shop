#!/usr/bin/env node
// 模块图闭环检查：读每个模块目录下 README.md 的 yaml 块 + package-info.java，核七件事。
//
//   1. schema 唯一（模块 = 顶层包 = schema，三者一对一）
//   2. depends_on 指向真实存在的模块
//   3. 模块级依赖无环
//   4. 事件双向闭合：发出去的有人收，收进来的有人发
//   5. api/ 与 events/ 不许是空目录，且必须有 package-info.java 声明 @NamedInterface
//   6. depends_on 里的 "x :: api" 不能悬空：x 得真的暴露了这个命名接口
//   7. README 的 depends_on 与 package-info 的 allowedDependencies 对账
//
// 1–3、5–6 是硬错，退出码非零；4（事件缺口）与 7（文档漂移）只报告不判失败——
// 判失败就逼着人把「还没设计」写成「已经设计了」，那比缺口本身更坏。
//
// 为什么不把这些交给 Spring Modulith：verify() 读的是**已编译的字节码**，它看不见
// 还没开工的 17 个模块、看不见 Postgres schema、也不检查「事件发了没人收」。
// 分工是 Modulith 管运行中的代码（ModularityTest），这里管图纸。
// 环检测与 verify() 重叠是有意的：设计期先拦一次，别等写完代码才红。

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
    const body = lines.slice(start + 1, end)
    for (let i = 0; i < body.length; i++) {
        const match = body[i].match(/^([a-z_]+):\s*(.*)$/)
        if (!match) continue
        let value = match[2]
        // YAML 允许把列表换行写到下一行（trade 的 depends_on 就是这样，还可能跨多行）。
        // 不认这种写法的话，trade 的 6 条依赖会被读成空数组——环检测和对账会同时失效。
        if (!value.trim()) {
            const collected = []
            for (let j = i + 1; j < body.length && /^\s+\S/.test(body[j]); j++)
                collected.push(body[j])
            value = collected.join(" ")
        }
        fields[match[1]] = value
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
        `进行中 ${healthy.filter((m) => m.status === "in-progress").length}，` +
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

// ── 命名接口：api/ 与 events/ 是窗口，窗口要么开着，要么别建 ──
// 框架的 verify() 只在「有人违规引用」时才说话；空目录、缺 package-info 这类
// 「窗口其实是假的」它完全看不见——那正是这里要拦的。
const notes = []
const exposed = new Map() // 模块 → 它暴露的命名接口名集合

for (const module of healthy) {
    const moduleDir = join(BASE, module.name)
    const ifaceNames = new Set()

    for (const pkg of ["api", "events"]) {
        let entries
        try {
            entries = await readdir(join(moduleDir, pkg))
        } catch {
            continue
        }
        const files = entries.filter((f) => f !== "package-info.java")
        if (!files.length) {
            problems.push(`${module.name}/${pkg}：空目录——没有对外类型就不要建，建了就得有东西`)
            continue
        }
        if (!entries.includes("package-info.java")) {
            problems.push(
                `${module.name}/${pkg}：缺 package-info.java，没有 @NamedInterface，这个窗口对框架不存在`,
            )
            continue
        }
        const info = await readFile(join(moduleDir, pkg, "package-info.java"), "utf8")
        const match = info.match(/NamedInterface\(\s*"([^"]+)"/)
        if (!match) {
            problems.push(`${module.name}/${pkg}：package-info.java 里没有 @NamedInterface`)
            continue
        }
        if (match[1] !== pkg) {
            problems.push(`${module.name}/${pkg}：命名接口叫 "${match[1]}"，与目录名 ${pkg} 不一致`)
        }
        ifaceNames.add(match[1])
    }

    // 命名接口也能挂在别的包上（一个名字可以横跨多个包），这里只登记、不判错——
    // 但挂到 service/ 这种实现包上，等于把内部当出口，给一条提示
    for (const entry of await readdir(moduleDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === "api" || entry.name === "events") continue
        let info
        try {
            info = await readFile(join(moduleDir, entry.name, "package-info.java"), "utf8")
        } catch {
            continue
        }
        for (const match of info.matchAll(/NamedInterface\(\s*"([^"]+)"/g)) {
            ifaceNames.add(match[1])
            if (match[1] === "api" || match[1] === "events") {
                notes.push(
                    `${module.name}/${entry.name}：把 "${match[1]}" 挂在了非约定目录上——` +
                        `契约类型该搬进 ${match[1]}/，别让实现包冒充出口`,
                )
            }
        }
    }

    exposed.set(module.name, ifaceNames)
}

// 悬空引用：README 说依赖 "x :: api"，x 就得真的有这个命名接口。
// 这类声明在没人真引用时是惰性的（verify() 不会报），一旦有人 import 才炸，
// 而报错是「依赖了未允许的模块」，不容易看出该去补命名接口。
// 只对**已开工**的模块判（有 package-info.java 才算）：17 个未开工模块连类都没有，
// 它们被依赖是设计意图，不是缺口。
const started = new Set()
for (const module of healthy) {
    try {
        await readFile(join(BASE, module.name, "package-info.java"), "utf8")
        started.add(module.name)
    } catch {
        // 没有 package-info：还没开工
    }
}

for (const module of healthy) {
    for (const dep of module.dependsOn) {
        const [target, iface] = dep.split("::").map((part) => part.trim())
        if (!iface || !started.has(target)) continue
        const ifaceNames = exposed.get(target)
        if (ifaceNames && !ifaceNames.has(iface)) {
            problems.push(
                `${module.name}：depends_on 的 ${dep} 悬空——${target} 没有暴露命名接口 "${iface}"`,
            )
        }
    }
}

// ── 两份声明对账：README 的 depends_on vs package-info 的 allowedDependencies ──
// 两处手写必然漂移，而漂移的后果是 modules:check 和 verify() 各说各话。
// 只报告不判失败：未开工的模块常常先写文档、后写注解，硬判会逼人写假注解。
const drift = []
for (const module of healthy) {
    let info
    try {
        info = await readFile(join(BASE, module.name, "package-info.java"), "utf8")
    } catch {
        continue // 还没有 package-info 的模块（未开工）不参与对账
    }
    const block = info.match(/allowedDependencies\s*=\s*\{([\s\S]*?)\}/)
    const declared = block ? [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : []
    const onlyReadme = module.dependsOn.filter((d) => !declared.includes(d))
    const onlyCode = declared.filter((d) => !module.dependsOn.includes(d))
    if (onlyReadme.length)
        drift.push(`${module.name}：README 有、注解没有 → ${onlyReadme.join(", ")}`)
    if (onlyCode.length) drift.push(`${module.name}：注解有、README 没有 → ${onlyCode.join(", ")}`)
}

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

if (drift.length) {
    out.push("")
    out.push(`文档漂移 ${drift.length}（README 与注解各说各话，不判失败）：`)
    for (const line of drift) out.push(`  ${line}`)
}

if (notes.length) {
    out.push("")
    out.push(`窗口位置提示 ${notes.length}：`)
    for (const note of notes) out.push(`  ${note}`)
}

if (problems.length) {
    out.push("")
    out.push(`结构问题 ${problems.length}：`)
    for (const problem of problems) out.push(`  ${problem}`)
}

console.log(out.join("\n"))
process.exit(problems.length ? 1 : 0)
