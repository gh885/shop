import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"

const ROOT = process.cwd()
const LOCALES = ["zh-CN", "en-US"]
const RESOURCE_ROOTS = ["apps/web/src/locales", "apps/seller/src/locales", "apps/admin/src/locales"]

async function listJsonFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    const files = await Promise.all(
        entries.map(async (entry) => {
            const path = join(dir, entry.name)
            if (entry.isDirectory()) return listJsonFiles(path)
            if (entry.isFile() && entry.name.endsWith(".json")) return [path]
            return []
        }),
    )
    return files.flat()
}

function flatten(value, prefix = "") {
    const result = new Map()
    if (value === null || typeof value !== "object") {
        result.set(prefix, value)
        return result
    }
    for (const [key, child] of Object.entries(value)) {
        const next = prefix ? `${prefix}.${key}` : key
        for (const [childKey, childValue] of flatten(child, next)) {
            result.set(childKey, childValue)
        }
    }
    return result
}

function placeholders(text) {
    return new Set([...text.matchAll(/\{([a-zA-Z_][\w]*)\}/g)].map((match) => match[1]))
}

function bracesBalanced(text) {
    let depth = 0
    for (const char of text) {
        if (char === "{") depth += 1
        if (char === "}") depth -= 1
        if (depth < 0) return false
    }
    return depth === 0
}

function sameSet(a, b) {
    if (a.size !== b.size) return false
    for (const item of a) if (!b.has(item)) return false
    return true
}

async function readCatalog(path) {
    const raw = await readFile(path, "utf8")
    const json = JSON.parse(raw)
    return { raw, entries: flatten(json) }
}

async function main() {
    const errors = []
    for (const root of RESOURCE_ROOTS) {
        const base = join(ROOT, root)
        let zhFiles = []
        let enFiles = []
        try {
            zhFiles = await listJsonFiles(join(base, LOCALES[0]))
            enFiles = await listJsonFiles(join(base, LOCALES[1]))
        } catch (error) {
            errors.push(`${root}: 无法读取语言目录 (${error.message})`)
            continue
        }
        for (const zhPath of zhFiles) {
            const relativeZh = relative(join(base, LOCALES[0]), zhPath)
            const enPath = join(base, LOCALES[1], relativeZh)
            if (!enFiles.includes(enPath)) {
                errors.push(`${root}: en-US 缺少 ${relativeZh}`)
                continue
            }
            const zh = await readCatalog(zhPath)
            const en = await readCatalog(enPath)
            for (const key of zh.entries.keys()) {
                if (!en.entries.has(key))
                    errors.push(`${root}: en-US 缺少 key ${relativeZh}:${key}`)
            }
            for (const key of en.entries.keys()) {
                if (!zh.entries.has(key))
                    errors.push(`${root}: zh-CN 缺少 key ${relativeZh}:${key}`)
            }
            for (const [key, value] of zh.entries) {
                if (typeof value !== "string") continue
                if (!bracesBalanced(value))
                    errors.push(`${root}: ${relativeZh}:${key} 花括号不配对`)
                const enValue = en.entries.get(key)
                if (typeof enValue !== "string") continue
                if (!sameSet(placeholders(value), placeholders(enValue))) {
                    errors.push(`${root}: ${relativeZh}:${key} 占位符不一致`)
                }
            }
        }
        // 反方向也要查：只在 en-US 出现的文件不会进上面那个循环，漏了就是静默绿
        for (const enPath of enFiles) {
            const relativeEn = relative(join(base, LOCALES[1]), enPath)
            if (!zhFiles.includes(join(base, LOCALES[0], relativeEn))) {
                errors.push(`${root}: zh-CN 缺少 ${relativeEn}`)
            }
        }
    }
    if (errors.length > 0) {
        console.error("i18n check failed:")
        for (const error of errors) console.error(`  - ${error}`)
        process.exit(1)
    }
    console.log("i18n check passed")
}

await main()
