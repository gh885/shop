import { defineConfig, loadEnv, lazyPlugins } from "vite-plus"

import { tanstackRouter } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_")
    const backend = env.VITE_BACKEND_URL || "http://localhost:8080"
    return {
        resolve: { tsconfigPaths: true },
        // 错误上报要能还原到源码（frontend-monitoring 契约第 4 条）。hidden 生成 .map 但不在产物里
        // 留 sourceMappingURL 注释：产物照常发，map 按 version 单独归档、不随静态资源上线。
        // 留成 true（会写 sourceMappingURL）会让浏览器去线上拉 .map——那是把源码目录结构公开出去
        build: { sourcemap: "hidden" },
        server: {
            port: 4000,
            proxy: {
                // 同源代理到后端，规避 CORS / refresh cookie（Secure + httpOnly）跨域问题
                "/admin": { target: backend, changeOrigin: true },
            },
        },
        plugins: lazyPlugins(() => [
            // 必须在 react 插件之前：自动代码分割把每个路由的组件拆进独立 chunk，
            // 管理端各低频页不再进首屏包；配合 defaultPreload:"intent" 悬停预取
            tanstackRouter({ target: "react", autoCodeSplitting: true }),
            tailwindcss(),
            viteReact({ compiler: true }),
        ]),
    }
})
