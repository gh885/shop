import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

/**
 * web 测试环境：jsdom + Testing Library。组件/集成测试在此跑；
 * 纯逻辑单测同样可用（jsdom 对它们只是多一层开销，不值得拆双环境配置）。
 * 注意：不挂 React Compiler 的 babel preset —— 测试断言行为，不断言渲染次数。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true }, // 与 vite.config 一致：ui-web 内部的 shadcn 别名（src/lib/utils）靠 tsconfig paths 解析
    plugins: [viteReact()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
    },
})
