import { defineConfig } from "vite-plus"

export default defineConfig({
    test: {
        name: "perf",
        // 与 scripts 同一口径：用例会拉起 LHCI / Size Limit 子进程并监听端口，
        // 不共享模块状态。isolate 必须落在 project 自己的 test 块，根配置的 projects 不继承。
        isolate: true,
        environment: "node",
        include: ["*.test.mjs"],
    },
})
