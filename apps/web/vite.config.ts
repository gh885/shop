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
            // 注意：/cart 既是买家端页面路由（/cart），也是购物车 API 前缀（/cart/items）。
            // 代理 key 必须写成 "/cart/"，否则 http-proxy 的 prefix 匹配会把页面请求 /cart 也劫持到后端，
            // 导致整页返回 401（后端对 /cart 无处理，且要求登录）。API 永远只调 /cart/*，不调裸 /cart。
            "/auth": { target: "http://localhost:8080", changeOrigin: true },
            "/api": { target: "http://localhost:8080", changeOrigin: true },
            "/user": { target: "http://localhost:8080", changeOrigin: true },
            "/cart/": { target: "http://localhost:8080", changeOrigin: true },
            // /orders、/payments 同理：买家端页面路由（/orders）与 API 前缀（/orders/*）重叠，
            // 代理只写带尾斜杠的 key，页面路由不被劫持；支付入口是 POST /payments，无裸路径调用
            "/orders/": { target: "http://localhost:8080", changeOrigin: true },
            "/payments": { target: "http://localhost:8080", changeOrigin: true },
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
