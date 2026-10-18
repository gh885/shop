import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

/**
 * app-kit 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library，与 apps/* 同一约定。
 * 这里测的是「共享接线」本身（错误边界的重置链路），业务域的行为仍由 apps/* 覆盖。
 *
 * 环境按文件名分，不看扩展名：`*.test.tsx`（含 JSX）与 `*.dom.test.ts`（零 JSX、但要浏览器环境——读写 document.cookie/navigator.languages、renderHook 要 DOM）都进 jsdom；其余 `*.test.ts` 走 Node。
 */
export default defineConfig({
    // ui-web 的组件内部按自己的 tsconfig paths 引用（`src/lib/utils`、`#/*`），
    // 且是 tsconfig 相对「引用方」逐文件解析 —— 没有这行，app-kit 侧渲染 ui-web 组件会解析失败
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
        name: "@shop/app-kit",
        // isolate 必须落在 project 自己的 test 块：根配置的 `projects` 是 config 文件引用，
        // Vitest 不为这种 project 继承根 test 选项。下面的 unit/dom 是 inline project，会继承本文件。
        // 保持 isolate:true（Vitest 默认）：模块单例（SDK client 等）在 isolate:false 下会跨文件串味，
        // CI 2 核 runner 实测复现。理由详见 apps/web/vite.config.ts 的同处注释。
        isolate: true,
        projects: [
            {
                test: {
                    name: "unit",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: ["src/**/*.dom.test.ts"],
                },
            },
            {
                test: {
                    name: "dom",
                    environment: "jsdom",
                    setupFiles: ["./src/test/setup.ts"],
                    include: ["src/**/*.test.tsx", "src/**/*.dom.test.ts"],
                },
            },
        ],
    },
})
