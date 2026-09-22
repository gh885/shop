import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

/**
 * admin 测试环境：jsdom + Testing Library，与 apps/web 同一约定。
 * 注意：不挂 React Compiler 的 babel preset —— 测试断言行为，不断言渲染次数。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
        environment: "jsdom",
        setupFiles: ["@shop/app-kit/test/setup"],
        include: ["src/**/*.test.{ts,tsx}"],
    },
})
