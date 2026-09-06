import { defineConfig } from "vitest/config"

/** packages/api：纯逻辑包，node 环境即可（money / api-error 等工具的单元测试） */
export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
})
