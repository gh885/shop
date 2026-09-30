import { defineConfig } from "vite-plus"

import { tanstackRouter } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { shopAppConfig } from "../../packages/config/vite-app.config"

export default defineConfig(({ mode }) =>
    shopAppConfig({
        mode,
        port: 5000,
        proxy: ["/auth", "/shops", "/seller", "/api"],
        plugins: () => [
            // 必须在 react 插件之前：自动代码分割把每个路由的 component/pendingComponent 等
            // 拆进独立 chunk（低频页如发布向导不再进首屏包）；配合 defaultPreload:"intent" 悬停预取
            tanstackRouter({ target: "react", autoCodeSplitting: true }),
            tailwindcss(),
            viteReact({ compiler: true }),
        ],
    }),
)
