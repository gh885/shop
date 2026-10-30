import { defineConfig } from "vite-plus"

import tailwindcss from "@tailwindcss/vite"
import viteReact from "@vitejs/plugin-react"

/**
 * 平台前端是独立 SPA：没有 SEO 需求，SSR 只会多一条要被 trace 穿透的链路。
 * 它不 extends `@shop/config`——那会让 telemetry 依赖 shop 的构建配置，搬走时要剥离。
 */
export default defineConfig({
    plugins: [tailwindcss(), viteReact()],
    // 平台前端在 6000，api 在 8090：开发期走 Vite 代理，**不靠放宽 relay 的 CORS**。
    // relay 的 CORS 是给"浏览器采集端上报"用的，按项目白名单放行；把 6000 加进去会模糊这两件事。
    server: { port: 6000, proxy: { "/api": "http://localhost:8090" } },
})
