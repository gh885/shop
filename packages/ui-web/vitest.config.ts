import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

/**
 * ui-web 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library，与 apps/* 同一约定。
 * 组件库的组合行为（useDataTable + DataTable 装配）在这里测；
 * 纯展示 primitives 仍由消费端（apps/*）的集成测试覆盖。
 *
 * `.test.ts` 全在 Node（`File` 是 Node 20+ 的全局，不为它起 DOM），但上传那条链会调
 * `requestAnimationFrame`（真实浏览器 API），所以 file-upload-store 留在 jsdom 组。
 */
const domTests = ["src/components/file-upload-store.test.ts"]
export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
        name: "@shop/ui-web",
        projects: [
            {
                test: {
                    name: "unit",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: domTests,
                },
            },
            {
                test: {
                    name: "dom",
                    environment: "jsdom",
                    setupFiles: ["./src/test/setup.ts"],
                    include: ["src/**/*.test.tsx", ...domTests],
                },
            },
        ],
    },
})
