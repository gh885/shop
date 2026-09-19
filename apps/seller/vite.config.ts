import { defineConfig, loadEnv } from "vite"

import { tanstackRouter } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_")
    const backend = env.VITE_BACKEND_URL || "http://localhost:8080"
    return {
        resolve: { tsconfigPaths: true },
        server: {
            port: 5000,
            proxy: {
                // 同源代理到后端，规避 CORS / refresh cookie（Secure + httpOnly）跨域问题
                "/auth": { target: backend, changeOrigin: true },
                "/shops": { target: backend, changeOrigin: true },
                "/seller": { target: backend, changeOrigin: true },
                "/api": { target: backend, changeOrigin: true },
            },
        },
        plugins: [
            // 必须在 react 插件之前：自动代码分割把每个路由的 component/pendingComponent 等
            // 拆进独立 chunk（低频页如发布向导不再进首屏包）；配合 defaultPreload:"intent" 悬停预取
            tanstackRouter({ target: "react", autoCodeSplitting: true }),
            tailwindcss(),
            viteReact({ compiler: true }),
        ],
    }
})
