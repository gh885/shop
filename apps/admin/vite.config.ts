import { defineConfig } from "vite-plus"

import { devtools } from "@tanstack/devtools-vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { shopAppConfig } from "@shop/config/vite-app"

/**
 * admin 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library，与 apps/web 同一约定。唯一与 web/seller 不同：**这里挂 React Compiler**。admin 的表格与树都读外部可变 store（data-grid 的 table 实例、headless-tree 的 tree 实例），而那类读取正是编译器会静默缓存住的东西——不跑编译器的测试永远看不见「树是空的 / 勾选框不响应」这种回归（类目树实测整棵树空白过一次，见 category-tree.tsx 的 `use no memo`）。用例只断言可观察后果（文案、请求体）、不断言渲染次数，所以挂上编译器不改变断言口径。测试配置与 app 配置同住这份文件后，编译器随下方 `viteReact({ compiler: true })` 一起来，两个子项目共享、Node 组也一样编译——测试与生产同一份插件。
 */
export default defineConfig(({ mode }) => ({
    ...shopAppConfig({
        mode,
        port: 4000,
        proxy: ["/admin"],
        plugins: () => [
            // 统一 devtools 面板（Router+Query）。构建时由该插件的 remove-devtools-on-build 子插件自动剥离，故 __root 可无条件挂载。consolePiping 关掉：Vite+ 已把浏览器日志转到终端，再开双向管道会循环回传 [Server] 日志（与 apps/web 同一处置）。
            devtools({ consolePiping: { enabled: false } }),
            // 必须在 react 插件之前：自动代码分割把每个路由的组件拆进独立 chunk，管理端各低频页不再进首屏包；配合 defaultPreload:"intent" 悬停预取
            tanstackRouter({ target: "react", autoCodeSplitting: true }),
            tailwindcss(),
            viteReact({ compiler: true }),
        ],
    }),
    test: {
        name: "admin",
        // isolate 必须落在 project 自己的 test 块：根配置的 projects 是 config 文件引用，Vitest 不为这种 project 继承根 test 选项（下面的 unit/dom 是 inline project，会继承本文件）。保持 isolate:true（Vitest 默认）：模块单例（SDK client 等）在 isolate:false 下会跨文件串味，CI 2 核 runner 实测复现。理由详见 apps/web/vite.config.ts 的同处注释。
        isolate: true,
        projects: [
            {
                test: {
                    name: "unit",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                },
            },
            {
                test: {
                    name: "dom",
                    environment: "jsdom",
                    setupFiles: ["@shop/app-kit/test/setup"],
                    include: ["src/**/*.test.tsx"],
                },
            },
        ],
    },
}))
