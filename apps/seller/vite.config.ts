import { defineConfig } from "vite-plus"

import { devtools } from "@tanstack/devtools-vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { shopAppConfig } from "@shop/config/vite-app"

/**
 * seller 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library，与 apps/web 同一约定。Vitest 5 子项目共享 Vite server，--project seller 仍会选中全部子项目。测试配置与 app 配置同住这份文件，但插件按 `mode` 分叉：测试下不挂 React Compiler（理由见下方插件清单旁的注释），与迁移前的独立测试配置语义一致。组件/集成用例（order/list/ship-dialog.test.tsx 等）都还在，用例被误删要能被 CI 发现。
 *
 * 环境按文件名分，不看扩展名：`*.test.tsx`（含 JSX）与 `*.dom.test.ts`（零 JSX、但要浏览器环境——共享 MSW/SDK 装配、读写 localStorage、renderHook 要 DOM）都进 jsdom；其余 `*.test.ts` 走 Node。
 */
export default defineConfig(({ mode }) => ({
    ...shopAppConfig({
        mode,
        port: 5000,
        proxy: ["/auth", "/shops", "/seller", "/api"],
        plugins: () => [
            // 统一 devtools 面板（Router+Query）。构建时由该插件的 remove-devtools-on-build 子插件自动剥离，故 __root 可无条件挂载。consolePiping 关掉：Vite+ 已把浏览器日志转到终端，再开双向管道会循环回传 [Server] 日志（与 apps/web 同一处置）。
            devtools({ consolePiping: { enabled: false } }),
            // 必须在 react 插件之前：自动代码分割把每个路由的 component/pendingComponent 等拆进独立 chunk（低频页如发布向导不再进首屏包）；配合 defaultPreload:"intent" 悬停预取
            tanstackRouter({ target: "react", autoCodeSplitting: true }),
            tailwindcss(),
            // 测试下不挂 React Compiler：原测试配置用的就是不带编译器的 viteReact()。用例断言行为、不断言渲染次数，编译器在这里只带来 transform 开销——实测它让 ProductEditor 那组重组件用例从「贴着 5s 上限」变成超时。
            viteReact(mode === "test" ? {} : { compiler: true }),
        ],
    }),
    test: {
        name: "seller",
        // isolate 必须落在 project 自己的 test 块：根配置的 projects 是 config 文件引用，Vitest 不为这种 project 继承根 test 选项（下面的 unit/dom 是 inline project，会继承本文件）。保持 isolate:true（Vitest 默认）：模块单例（SDK client 等）在 isolate:false 下会跨文件串味，CI 2 核 runner 实测复现。理由详见 apps/web/vite.config.ts 的同处注释。
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
                    setupFiles: ["@shop/app-kit/test/setup"],
                    include: ["src/**/*.test.tsx", "src/**/*.dom.test.ts"],
                },
            },
        ],
    },
}))
