import { defineConfig } from "vite-plus"

/** packages/client：传输与登录态装配，单测全桩 fetch，node 环境即可（与拆分前一致） */
export default defineConfig({
    test: {
        name: "@shop/client",
        isolate: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
})
