#!/usr/bin/env node
// 把构建产物的 sourcemap 上传到平台。
//
//   node telemetry/scripts/upload-sourcemaps.mjs apps/web/dist
//   node telemetry/scripts/upload-sourcemaps.mjs apps/web/dist --base http://localhost:8090 --project 1
//
// 只认一个契约：**map 里的 debug_id**（`@sentry/bundler-plugin` 注入的那个 uuid）。
// 不认文件名、不认 release——文件名每次构建都带新 hash，靠它匹配是"符号表永远对不上"的根源。
//
// 本脚本刻意不做的事情：不注入 debug_id、不改产物。注入是 bundler 插件的活。
import { readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, relative } from "node:path"

const args = process.argv.slice(2)
const distDir = args.find((arg) => !arg.startsWith("--"))
if (!distDir) {
    console.error(
        "用法: node telemetry/scripts/upload-sourcemaps.mjs <distDir> [--base URL] [--project ID]",
    )
    process.exit(2)
}

const flag = (name, fallback) => {
    const index = args.indexOf(`--${name}`)
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const baseUrl = flag("base", "http://localhost:8090").replace(/\/$/, "")
const projectId = flag("project", "1")

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            yield* walk(full)
        } else if (extname(full) === ".map") {
            yield full
        }
    }
}

let uploaded = 0
let skipped = 0

for (const file of walk(distDir)) {
    let map
    try {
        map = JSON.parse(readFileSync(file, "utf8"))
    } catch (error) {
        console.warn(`跳过（不是合法 JSON）: ${file} — ${error.message}`)
        skipped++
        continue
    }
    const debugId = map.debug_id ?? map.debugId
    if (!debugId) {
        // 没有 debug_id 说明 bundler 插件没开 debug id 注入，传上去也无法被匹配
        console.warn(`跳过（无 debug_id）: ${file}`)
        skipped++
        continue
    }
    const bundleUrl = relative(distDir, file).replace(/\.map$/, "")
    const response = await fetch(
        `${baseUrl}/api/${projectId}/sourcemaps/${debugId}?url=${encodeURIComponent(bundleUrl)}`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(map),
        },
    )
    if (!response.ok) {
        console.error(`失败 ${response.status}: ${bundleUrl} — ${await response.text()}`)
        skipped++
        continue
    }
    const result = await response.json()
    console.log(`已上传 ${result.debugId} ← ${bundleUrl}（${result.sources} 个源文件）`)
    uploaded++
}

console.log(`\n完成：上传 ${uploaded}，跳过 ${skipped}`)
if (skipped > 0) {
    process.exitCode = 1
}
