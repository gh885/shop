import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

/**
 * app-kit 测试环境：jsdom + Testing Library，与 apps/* 同一约定。
 * 这里测的是「共享接线」本身（错误边界的重置链路），业务域的行为仍由 apps/* 覆盖。
 */
export default defineConfig({
    // ui-web 的组件内部按自己的 tsconfig paths 引用（`src/lib/utils`、`#/*`），
    // 且是 tsconfig 相对「引用方」逐文件解析 —— 没有这行，app-kit 侧渲染 ui-web 组件会解析失败
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
    },
})
