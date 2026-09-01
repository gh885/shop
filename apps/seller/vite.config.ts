import { defineConfig, loadEnv } from "vite"

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
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
        plugins: [tailwindcss(), viteReact(), babel({ presets: [reactCompilerPreset()] })],
    }
})
