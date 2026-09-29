import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

/**
 * 这两份虽是 .ts，仍要浏览器语义，所以留在 jsdom 组里，别因为扩展名是 .ts 就分到 Node：
 * api.test.ts 要共享 MSW/SDK 装配（拦截器 + baseUrl 压成绝对地址）；
 * shop-store.test.ts 直接读写 localStorage。
 */
const domTests = ["src/shared/lib/api.test.ts", "src/shared/lib/shop-store.test.ts"]

/**
 * seller 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library，与 apps/web 同一约定。
 * Vitest 5 的子项目共享 Vite server；--project seller 仍会选中全部子项目。
 * 注意：不挂 React Compiler 的 babel preset —— 测试断言行为，不断言渲染次数。
 * 组件/集成用例（order/list/ship-dialog.test.tsx 等）都还在，用例被误删要能被 CI 发现。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
        name: "seller",
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
                    setupFiles: ["@shop/app-kit/test/setup"],
                    include: ["src/**/*.test.tsx", ...domTests],
                },
            },
        ],
    },
})
