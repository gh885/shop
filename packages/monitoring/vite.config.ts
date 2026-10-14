import { defineConfig } from "vite-plus"

/** packages/monitoring：浏览器侧代码，但单测打桩 DOM，node 环境即可（与拆分前一致） */
export default defineConfig({
    test: {
        name: "@shop/monitoring",
        isolate: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
})
