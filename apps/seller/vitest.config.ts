import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

/**
 * seller 测试环境：jsdom + Testing Library，与 apps/web 同一约定。
 * 注意：不挂 React Compiler 的 babel preset —— 测试断言行为，不断言渲染次数。
 * 已有用例（order/list/ship-dialog.test.tsx），不再开 passWithNoTests：用例被误删要能被 CI 发现。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
        // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
        environment: "jsdom",
        setupFiles: ["@shop/app-kit/test/setup"],
        include: ["src/**/*.test.{ts,tsx}"],
    },
})
