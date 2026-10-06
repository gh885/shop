#!/usr/bin/env node
// 只负责编排生产构建；模块归因与依赖图由 Visualizer 生成，不再自行解析 sourcemap。
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const apps = ["web", "seller", "admin"]
const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && !apps.includes(args[0]))) {
    console.error("用法：pnpm perf:attrib [web|seller|admin]（默认构建三端）")
    process.exitCode = 1
} else {
    for (const app of args.length ? args : apps) {
        const result = spawnSync(`pnpm build:${app}`, {
            cwd: resolve(import.meta.dirname, ".."),
            env: { ...process.env, SHOP_ANALYZE: "1" },
            stdio: "inherit",
            shell: true,
        })
        if (result.error || result.status !== 0) {
            console.error(result.error ?? `构建 ${app} 失败（exit ${result.status}）`)
            process.exitCode = result.status || 1
            break
        }
    }
    if (!process.exitCode)
        console.log("分析报告：.artifacts/perf/bundle/（treemap 看体积，network 看依赖）")
}
