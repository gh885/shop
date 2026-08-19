import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"

const config = defineConfig({
    resolve: { tsconfigPaths: true },
    server: {
        proxy: {
            // 同源代理到后端，规避 CORS / refresh cookie（Secure + httpOnly）跨域问题
            "/auth": { target: "http://localhost:8080", changeOrigin: true },
            "/api": { target: "http://localhost:8080", changeOrigin: true },
        },
    },
    plugins: [
        devtools(),
        tailwindcss(),
        tanstackStart(),
        viteReact(),
        babel({ presets: [reactCompilerPreset()] }),
    ],
})

export default config
