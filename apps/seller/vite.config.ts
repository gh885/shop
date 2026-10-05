import { defineConfig } from "vite-plus"

import { tanstackRouter } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { shopAppConfig } from "@shop/config/vite-app"

/**
 * 这两份虽是 .ts，仍要浏览器语义，所以留在 jsdom 组里，别因为扩展名是 .ts 就分到 Node：
 * api.test.ts 要共享 MSW/SDK 装配（拦截器 + baseUrl 压成绝对地址）；
 * shop-store.test.ts 直接读写 localStorage。
 */
const domTests = ["src/shared/lib/api.test.ts", "src/shared/lib/shop-store.test.ts"]

/**
 * seller 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library，与 apps/web 同一约定。
 * Vitest 5 的子项目共享 Vite server；--project seller 仍会选中全部子项目。
 * 测试配置与 app 配置同住这份文件，但插件按 `mode` 分叉：测试下不挂 React Compiler
 * （理由见下方插件清单旁的注释），与迁移前的独立测试配置语义一致。
 * 组件/集成用例（order/list/ship-dialog.test.tsx 等）都还在，用例被误删要能被 CI 发现。
 */
export default defineConfig(({ mode }) => ({
    ...shopAppConfig({
        mode,
        port: 5000,
        proxy: ["/auth", "/shops", "/seller", "/api"],
        plugins: () => [
            // 必须在 react 插件之前：自动代码分割把每个路由的 component/pendingComponent 等
            // 拆进独立 chunk（低频页如发布向导不再进首屏包）；配合 defaultPreload:"intent" 悬停预取
            tanstackRouter({ target: "react", autoCodeSplitting: true }),
            tailwindcss(),
            // 测试下不挂 React Compiler：原测试配置用的就是不带编译器的 `viteReact()`。
            // 用例断言行为、不断言渲染次数，编译器在这里只带来 transform 开销——实测它让
            // ProductEditor 那组重组件用例从「贴着 5s 上限」变成超时。
            viteReact(mode === "test" ? {} : { compiler: true }),
        ],
    }),
    test: {
        name: "seller",
        // isolate 必须落在 project 自己的 test 块：根配置的 `projects` 是 config 文件引用，
        // Vitest 不为这种 project 继承根 test 选项。下面的 unit/dom 是 inline project，会继承本文件。
        // 理由与实测见 docs/conventions/frontend.md「迭代性能」。
        isolate: false,
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
                    setupFiles: ["@shop/app-kit/test/setup"],
                    include: ["src/**/*.test.tsx", ...domTests],
                },
            },
        ],
    },
}))
