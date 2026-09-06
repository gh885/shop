import { defineConfig } from "vitest/config"

/**
 * Vitest monorepo 入口：以 workspace 内各包自己的 vitest.config.ts 为 project。
 * 没有测试配置的包（seller/admin/ui-web/config…）自然不参与。
 * 运行：pnpm test（根目录）；单包：pnpm --filter web exec vitest run。
 */
export default defineConfig({
    test: {
        projects: ["apps/*/vitest.config.ts", "packages/*/vitest.config.ts"],
    },
})
