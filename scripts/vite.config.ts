import { defineConfig } from "vite-plus"

export default defineConfig({
    test: {
        name: "scripts",
        // isolate 必须落在 project 自己的 test 块：根配置的 `projects` 是 config 文件引用，
        // Vitest 不为这种 project 继承根 test 选项。保持 isolate:true（Vitest 默认）：SDK client 单例
        // 在 isolate:false 下跨文件叠加拦截器（api 事件翻倍），CI 2 核 runner 实测复现，理由见 apps/web。
        isolate: true,
        environment: "node",
        include: ["*.test.mjs"],
    },
})
