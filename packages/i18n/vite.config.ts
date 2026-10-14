import { defineConfig } from "vite-plus"

/** packages/i18n：locale 判定与消息格式化，纯逻辑包，node 环境即可 */
export default defineConfig({
    test: {
        name: "@shop/i18n",
        isolate: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
})
