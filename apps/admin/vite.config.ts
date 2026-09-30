import { defineConfig } from "vite-plus"

import { tanstackRouter } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { shopAppConfig } from "../../packages/config/vite-app.config"

export default defineConfig(({ mode }) =>
    shopAppConfig({
        mode,
        port: 4000,
        proxy: ["/admin"],
        plugins: () => [
            // 必须在 react 插件之前：自动代码分割把每个路由的组件拆进独立 chunk，
            // 管理端各低频页不再进首屏包；配合 defaultPreload:"intent" 悬停预取
            tanstackRouter({ target: "react", autoCodeSplitting: true }),
            tailwindcss(),
            viteReact({ compiler: true }),
        ],
    }),
)
