import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

/**
 * ui-web 测试环境：jsdom + Testing Library，与 apps/* 同一约定。
 * 组件库的组合行为（useDataTable + DataTable 装配）在这里测；
 * 纯展示 primitives 仍由消费端（apps/*）的集成测试覆盖。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
    },
})
