import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

/**
 * admin 测试环境：jsdom + Testing Library，与 apps/web 同一约定。
 * 注意：不挂 React Compiler 的 babel preset —— 测试断言行为，不断言渲染次数。
 * passWithNoTests：暂无用例时不阻塞 pre-push。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
        passWithNoTests: true,
    },
})
