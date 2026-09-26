import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

/**
 * admin 测试环境：jsdom + Testing Library，与 apps/web 同一约定。
 *
 * 唯一与 web/seller 不同的地方：**这里挂 React Compiler**。admin 的表格与树都读外部可变
 * store（data-grid 的 table 实例、headless-tree 的 tree 实例），而那类读取正是编译器会
 * 静默缓存住的东西——不跑编译器的测试永远看不见「树是空的 / 勾选框不响应」这种回归
 * （类目树实测整棵树空白过一次，见 category-tree.tsx 的 `use no memo`）。
 * 用例只断言可观察后果（文案、请求体），不断言渲染次数，所以挂上编译器不改变断言口径。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [viteReact({ compiler: true })],
    test: {
        environment: "jsdom",
        setupFiles: ["@shop/app-kit/test/setup"],
        include: ["src/**/*.test.{ts,tsx}"],
    },
})
