import http from "node:http"
import { defineConfig, type Plugin } from "vite-plus"
import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { shopAppConfig } from "@shop/config/vite-app"

/**
 * /orders 代理（dev / preview 同源转发到后端）。
 *
 * 页面路由 /orders/$orderId 与 API `GET /orders/{id}` 共享同一条路径，
 * 静态前缀代理（"/orders/"）会把页面请求（直访/刷新订单详情页）劫持到后端——
 * 尾斜杠 key 只能保住裸 /orders，保不住带参数的页面路径。
 * 路径无法区分，但请求方可以：文档导航（浏览器地址栏/刷新）的 Accept 必含 text/html，
 * SDK 请求（fetch/ky 默认 Accept 是通配 `* / *`）不含 —— 按 Accept 分流：页面放行给 SSR，其余转发后端。
 * 其余前缀（/cart/、/coupons/ 等）页面与 API 路径不重叠，仍用静态代理。
 */
function ordersApiProxy(backend: string): Plugin {
    const target = new URL(backend)
    /** 仅处理 /orders/*：页面请求 next() 交给 SSR，API 请求转发后端（等价 changeOrigin） */
    const forward = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => {
        const url = req.url ?? ""
        const isDocumentNav = (req.headers.accept ?? "").includes("text/html")
        if (!url.startsWith("/orders/") || (req.method !== "POST" && isDocumentNav)) {
            next()
            return
        }
        // /orders/* 下的 POST 全是 API（下单/预览/取消/确认/售后），无页面 POST，直接转发
        const proxyReq = http.request(
            {
                hostname: target.hostname,
                port: target.port,
                path: url,
                method: req.method,
                headers: { ...req.headers, host: target.host },
            },
            (proxyRes) => {
                res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
                proxyRes.pipe(res)
            },
        )
        proxyReq.on("error", () => {
            if (!res.headersSent) res.writeHead(502)
            res.end()
        })
        req.pipe(proxyReq)
    }
    return {
        name: "shop-orders-api-proxy",
        configureServer(server) {
            server.middlewares.use(forward)
        },
        configurePreviewServer(server) {
            server.middlewares.use(forward)
        },
    }
}

const domTests = [
    "src/**/*.test.tsx",
    // 这些虽是 .ts，仍需要 React 渲染或共享 MSW/SDK 装配。
    "src/checkout/checkout.test.ts",
    "src/shared/lib/use-deadline.test.ts",
    "src/shared/api/client.locale.test.ts",
    "src/shared/api/client.ssr-locale.test.ts",
]

/**
 * web 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library。
 * Vitest 5 的子项目共享 Vite server；--project web 仍会选中全部子项目。
 * 测试配置与 app 配置同住这份文件，但插件按 `mode` 分叉：测试下不挂 React Compiler 与
 * tanstackStart（理由见下方插件清单旁的注释），与迁移前的独立测试配置语义一致。
 */
// Proxy 是 dev 工具，生产 SSR 的后端地址由 client.ts 的 VITE_BACKEND_URL 决定
export default defineConfig(({ mode }) => ({
    ...shopAppConfig({
        mode,
        proxy: [
            // 注意：/cart 既是买家端页面路由（/cart），也是购物车 API 前缀（/cart/items）。
            // 代理 key 必须写成 "/cart/"，否则 http-proxy 的 prefix 匹配会把页面请求 /cart 也劫持到后端，
            // 导致整页返回 401（后端对 /cart 无处理，且要求登录）。API 永远只调 /cart/*，不调裸 /cart。
            "/auth",
            "/api",
            "/user",
            "/cart/",
            // /orders 不走静态代理：页面 /orders/$orderId 与 API GET /orders/{id} 同路径，
            // 前缀匹配会把页面请求劫持到后端（详见上方 ordersApiProxy）。/payments 同理但无同名页面路由
            "/payments",
            // /favorites 同为已登录用户接口（根路径），但无同名页面路由（页面在 /account/favorites），
            // 且 API 会调裸 POST /favorites（收藏开关）——用无尾斜杠 key 同时覆盖裸路径与 /favorites/*
            "/favorites",
            // /coupons 同理：券包与领券 API 都在 /coupons/*（券包页面路由放 /account/coupons，不占 /coupons），
            // 匿名可访问的店铺领券页在 /api/shops/{id}/coupons，已被上面的 "/api" 覆盖
            "/coupons/",
            // 买家评价 API 前缀（POST /reviews/orders/{id}、POST /reviews/{id}/append、GET 同路径）。
            // 全站没有 /reviews 开头的页面路由（评价入口在订单详情里），故不需要尾斜杠，也不需要 Accept 分流。
            "/reviews",
        ],
        plugins: (backend) => [
            devtools(),
            tailwindcss(),
            ordersApiProxy(backend),
            // 同一路径按 cookie/Accept-Language 输出不同 HTML，不能发布单语言静态副本。
            // 测试下不挂：它会改 createIsomorphicFn 的分支选择（client.ssr-locale.test.ts 那批
            // 用例专门要 .server() 分支），而测试不跑真实 SSR 路由，没有它要承担的角色。
            ...(mode === "test" ? [] : [tanstackStart({ prerender: { enabled: false } })]),
            // 测试下不挂 React Compiler：原测试配置用的就是不带编译器的 `viteReact()`。
            // 用例断言行为、不断言渲染次数，编译器在这里只带来 transform 开销。
            viteReact(mode === "test" ? {} : { compiler: true }),
        ],
    }),
    test: {
        name: "web",
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
                    include: domTests,
                },
            },
        ],
        /**
         * 物流轨迹的用例断言的是 +08 的墙上时间串（formatNodeTime → app-kit formatTimeShort
         * 按宿主时区渲染，这是有意的产品行为）。不钉时区的话，同一份代码在本机 +08 绿、
         * 在 UTC 的 CI runner 上红 4 条（实测 Expected "07-26 09:06" / Received "07-26 01:06"）。
         * 钉在这里而不是 CI 步骤里：让本地任何时区的机器跑出的结果与 CI 一致。
         */
        env: { TZ: "Asia/Shanghai" },
    },
}))
