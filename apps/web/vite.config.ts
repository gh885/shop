import http from "node:http"
import { defineConfig, type Plugin } from "vite-plus"
import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { shopAppConfig } from "@shop/config/vite-app"

/**
 * 页面与 API 共用路径的代理（dev/preview 同源转发到后端）。页面路由 /orders/$orderId 与 API `GET /orders/{id}` 共享同一条路径，静态前缀代理会把页面请求（直访/刷新详情页）劫持到后端——尾斜杠 key 只保住裸 /orders、保不住带参数的页面路径。路径无法区分但请求方可以：文档导航（地址栏/刷新）Accept 必含 text/html，SDK 请求（fetch/ky 默认 `* /*`）不含——按 Accept 分流，页面放行给 SSR、其余转发后端。/cart 与 /cart/* 同样分流；其余 API 前缀仍用静态代理。
 */
function isDocumentRequest(request: http.IncomingMessage): boolean {
    return (
        ["GET", "HEAD"].includes(request.method ?? "GET") &&
        (request.headers.accept ?? "").includes("text/html")
    )
}

function pageApiProxy(backend: string): Plugin {
    const target = new URL(backend)
    /** 订单与购物车：文档请求交给 SSR，其余请求转发后端 */
    const forward = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => {
        const url = req.url ?? ""
        const pathname = new URL(url, target).pathname
        const sharedPath = ["/orders", "/cart"].some(
            (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
        )
        if (!sharedPath || isDocumentRequest(req)) {
            next()
            return
        }
        // 页面与 API 共用前缀时，非文档请求才转发后端
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
        name: "shop-page-api-proxy",
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
    // 纯逻辑+祖先遍历：判定不需要 DOM，但「往上扫到 body」要真 DOM 才测得动（拿假对象链去测等于测夹具）。不放进来就退化成「永远通过」的假绿。
    "src/home/category-nav-stacking.test.ts",
]

/**
 * web 测试环境：纯逻辑走 Node，组件/集成测试走 jsdom + Testing Library。Vitest 5 子项目共享 Vite server，--project web 仍会选中全部子项目。测试配置与 app 配置同住这份文件，但插件按 `mode` 分叉：测试下不挂 React Compiler 与 tanstackStart（理由见下方插件清单旁的注释），与迁移前的独立测试配置语义一致。
 */
// Proxy 是 dev 工具，生产 SSR 的后端地址由 client.ts 的 VITE_BACKEND_URL 决定
export default defineConfig(({ mode }) => ({
    ...shopAppConfig({
        mode,
        proxy: [
            // 购物车与订单的页面请求由 pageApiProxy 放行，API 请求仍同源转发。
            "/auth",
            "/api",
            "/user",
            // /orders 不走静态代理：页面 /orders/$orderId 与 API GET /orders/{id} 同路径，前缀匹配会劫持页面请求到后端（详见上方 pageApiProxy）。/payments 同理但无同名页面路由。
            "/payments",
            // /favorites 同为已登录用户接口（根路径）但无同名页面路由（页面在 /account/favorites），且 API 会调裸 POST /favorites（收藏开关）——用无尾斜杠 key 同时覆盖裸路径与 /favorites/*。
            "/favorites",
            // /coupons 同理：券包与领券 API 都在 /coupons/*（券包页面路由放 /account/coupons 不占 /coupons），匿名可访问的店铺领券页在 /api/shops/{id}/coupons，已被上面的 "/api" 覆盖。
            "/coupons/",
            // 买家评价 API 前缀（POST /reviews/orders/{id}、POST /reviews/{id}/append、GET 同路径）。全站没有 /reviews 开头的页面路由（评价入口在订单详情里），故不需尾斜杠、也不需 Accept 分流。
            "/reviews",
        ],
        plugins: (backend) => [
            // Vite+ 已把浏览器日志转到终端；再开 Devtools 双向管道会循环回传 [Server] 日志。
            devtools({ consolePiping: { enabled: false } }),
            tailwindcss(),
            pageApiProxy(backend),
            // 同一路径按 cookie/Accept-Language 输出不同 HTML，不能发布单语言静态副本。测试下不挂：它会改 createIsomorphicFn 的分支选择（client.ssr-locale.test.ts 那批用例专门要 .server() 分支），而测试不跑真实 SSR 路由，没有它要承担的角色。
            ...(mode === "test" ? [] : [tanstackStart({ prerender: { enabled: false } })]),
            // 测试下不挂 React Compiler：原测试配置用的就是不带编译器的 viteReact()。用例断言行为、不断言渲染次数，编译器在这里只带来 transform 开销。
            viteReact(mode === "test" ? {} : { compiler: true }),
        ],
    }),
    // 生产 SSR 把全部依赖打进 server.js：Vite 默认外置 node_modules 里的包，而 @shop/common/@shop/i18n 这类 workspace 包会被打进来、它们的依赖（如 intl-messageformat）却留成裸 import，pnpm 严格布局的运行镜像里解析不到。打平后运行时只需 dist+srvx、不带 node_modules。只在生产构建开：dev SSR 开了会让 Vite 预转换全部依赖、启动变慢。
    ...(mode === "production" ? { ssr: { noExternal: true } } : {}),
    test: {
        name: "web",
        // isolate 必须落在 project 自己的 test 块：根配置的 projects 是 config 文件引用，Vitest 不为这种 project 继承根 test 选项（下面的 unit/dom 是 inline project，会继承本文件）。保持 isolate:true（Vitest 默认）：本仓库测试满是模块单例（SDK client、监控上报、locale 当前语言），isolate:false 让同一 worker 里前一个文件的状态漏进后一个——CI 2 核 runner 实测串味（api 事件翻倍、locale 落回默认）。
        isolate: true,
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
         * 物流轨迹用例断言 +08 的墙上时间串（formatNodeTime → app-kit formatTimeShort 按宿主时区渲染，是有意的产品行为）。不钉时区则本机 +08 绿、UTC 的 CI runner 红 4 条（实测 Expected "07-26 09:06" / Received "07-26 01:06"）。钉在这里而不是 CI 步骤里：让本地任何时区跑出的结果与 CI 一致。
         */
        env: { TZ: "Asia/Shanghai" },
    },
}))
