import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

/**
 * 这几份虽是 .ts，仍要浏览器语义，所以留在 jsdom 组里，别因为扩展名是 .ts 就分到 Node：
 * locale.test.ts 读写 document.cookie 与 window.navigator.languages；
 * use-countdown.test.ts、data/out-of-range-page.test.ts 用 @testing-library/react 的 renderHook
 * （要 DOM 才能挂 hook）。
 */
const domTests = [
    "src/i18n/locale.test.ts",
    "src/auth/use-countdown.test.ts",
    "src/data/out-of-range-page.test.ts",
]

/**
 * app-kit 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library，与 apps/* 同一约定。
 * 这里测的是「共享接线」本身（错误边界的重置链路），业务域的行为仍由 apps/* 覆盖。
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
                    exclude: domTests,
                },
            },
            {
                test: {
                    name: "dom",
                    environment: "jsdom",
                    setupFiles: ["./src/test/setup.ts"],
                    include: ["src/**/*.test.tsx", ...domTests],
                },
            },
        ],
    },
})
