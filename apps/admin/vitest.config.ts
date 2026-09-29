import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

/**
 * admin 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library，与 apps/web 同一约定。
 *
 * 唯一与 web/seller 不同的地方：**这里挂 React Compiler**。admin 的表格与树都读外部可变
 * store（data-grid 的 table 实例、headless-tree 的 tree 实例），而那类读取正是编译器会
 * 静默缓存住的东西——不跑编译器的测试永远看不见「树是空的 / 勾选框不响应」这种回归
 * （类目树实测整棵树空白过一次，见 category-tree.tsx 的 `use no memo`）。
 * 用例只断言可观察后果（文案、请求体），不断言渲染次数，所以挂上编译器不改变断言口径。
 * 编译器随 viteReact() 挂在项目根配置上，两个子项目共享，Node 组也一样编译。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [viteReact({ compiler: true })],
    test: {
        name: "admin",
        projects: [
            {
                test: {
                    name: "unit",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                },
            },
            {
                test: {
                    name: "dom",
                    environment: "jsdom",
                    setupFiles: ["@shop/app-kit/test/setup"],
                    include: ["src/**/*.test.tsx"],
                },
            },
        ],
    },
})
