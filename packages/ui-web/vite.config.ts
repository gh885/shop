import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

/**
 * ui-web 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library，与 apps/* 同一约定。组件库的组合行为（useDataTable + DataTable 装配）在这里测；纯展示 primitives 仍由消费端（apps/*）集成测试覆盖。
 *
 * 环境按文件名分，不看扩展名：`*.test.tsx`（含 JSX）与 `*.dom.test.ts`（零 JSX、但要浏览器环境——上传那条链会调 requestAnimationFrame 这类真实浏览器 API）都进 jsdom；其余 `*.test.ts` 走 Node（File 是 Node 20+ 全局，不为它起 DOM）。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
        name: "@shop/ui-web",
        // isolate 必须落在 project 自己的 test 块：根配置的 projects 是 config 文件引用，Vitest 不为这种 project 继承根 test 选项（下面的 unit/dom 是 inline project，会继承本文件）。保持 isolate:true（Vitest 默认）：模块单例（SDK client 等）在 isolate:false 下会跨文件串味，CI 2 核 runner 实测复现。理由详见 apps/web/vite.config.ts 的同处注释。
        isolate: true,
        projects: [
            {
                test: {
                    name: "unit",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: ["src/**/*.dom.test.ts"],
                },
            },
            {
                test: {
                    name: "dom",
                    environment: "jsdom",
                    setupFiles: ["./src/test/setup.ts"],
                    include: ["src/**/*.test.tsx", "src/**/*.dom.test.ts"],
                },
            },
        ],
    },
})
