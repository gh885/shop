import { defineConfig, loadEnv } from "vite"
import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"

// 后端地址：VITE_BACKEND_URL（默认本地 8080）。Proxy 是 dev 工具，生产 SSR 的后端地址由 client.ts 的 VITE_BACKEND_URL 决定
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_")
    const backend = env.VITE_BACKEND_URL || "http://localhost:8080"
    return {
        resolve: { tsconfigPaths: true },
        server: {
            proxy: {
                // 同源代理到后端，规避 CORS / refresh cookie（Secure + httpOnly）跨域问题
                // 注意：/cart 既是买家端页面路由（/cart），也是购物车 API 前缀（/cart/items）。
                // 代理 key 必须写成 "/cart/"，否则 http-proxy 的 prefix 匹配会把页面请求 /cart 也劫持到后端，
                // 导致整页返回 401（后端对 /cart 无处理，且要求登录）。API 永远只调 /cart/*，不调裸 /cart。
                "/auth": { target: backend, changeOrigin: true },
                "/api": { target: backend, changeOrigin: true },
                "/user": { target: backend, changeOrigin: true },
                "/cart/": { target: backend, changeOrigin: true },
                // /orders、/payments 同理：买家端页面路由（/orders）与 API 前缀（/orders/*）重叠，
                // 代理只写带尾斜杠的 key，页面路由不被劫持；支付入口是 POST /payments，无裸路径调用
                "/orders/": { target: backend, changeOrigin: true },
                "/payments": { target: backend, changeOrigin: true },
                // /favorites 同为已登录用户接口（根路径），但无同名页面路由（页面在 /account/favorites），
                // 且 API 会调裸 POST /favorites（收藏开关）——用无尾斜杠 key 同时覆盖裸路径与 /favorites/*
                "/favorites": { target: backend, changeOrigin: true },
                // /coupons 同理：券包与领券 API 都在 /coupons/*（券包页面路由放 /account/coupons，不占 /coupons），
                // 匿名可访问的店铺领券页在 /api/shops/{id}/coupons，已被上面的 "/api" 覆盖
                "/coupons/": { target: backend, changeOrigin: true },
            },
        },
        plugins: [
            devtools(),
            tailwindcss(),
            tanstackStart(),
            viteReact(),
            babel({ presets: [reactCompilerPreset()] }),
        ],
    }
})
