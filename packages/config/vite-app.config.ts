import { lazyPlugins, loadEnv, type PluginOption, type ViteUserConfig } from "vite-plus"

/**
 * 三端共用的 vite 骨架：后端地址、tsconfig 路径解析、sourcemap 口径、同源代理表、插件懒加载。
 * 每个 app 只交代属于自己的三件事实——端口、要代理的前缀、插件清单。
 *
 * 为什么收成一份：admin / seller / web 三份配置此前把同一套骨架抄了三遍（fallow 的 clone group），
 * 而抄出来的那几行恰恰是最不该各写各的——`build.sourcemap` 写错一档就把源码目录结构公开上线，
 * 少一条 `changeOrigin` 就撞上 refresh cookie 的跨域问题。收成一处后，这类口径要改只改一处。
 *
 * `mode` 由调用方从 `defineConfig(({ mode }) => …)` 递进来：loadEnv 读的是**当前 app 目录**的
 * `.env*`（process.cwd() 就是那个目录），所以这份共用文件不替任何 app 猜目录。
 */
export type ShopAppConfig = {
    mode: string
    /** 各端 dev 端口（web 3000 / seller 5000 / admin 4000）；不填则让 Vite 自己挑 */
    port?: number
    /**
     * 同源代理到后端的路径前缀。写成清单而不是映射表：每个前缀「为什么要写成这样」
     * （尾斜杠、与页面路由撞名、Accept 分流）留在各 app 清单旁的注释里。
     */
    proxy?: readonly string[]
    /**
     * 插件清单。后端地址由骨架解析后递进来（web 的 ordersApiProxy 要在 dev / preview 中间件里
     * 转发给同一个后端，不能再抄一遍默认值）。
     */
    plugins: (backend: string) => PluginOption[]
}

export function shopAppConfig({ mode, port, proxy = [], plugins }: ShopAppConfig): ViteUserConfig {
    const env = loadEnv(mode, process.cwd(), "VITE_")
    const backend = env.VITE_BACKEND_URL || "http://localhost:8080"

    return {
        resolve: { tsconfigPaths: true },
        // 错误上报要能还原到源码（frontend-monitoring 契约第 4 条）。hidden 生成 .map 但不在产物里
        // 留 sourceMappingURL 注释：产物照常发，map 按 version 单独归档、不随静态资源上线。
        // 留成 true（会写 sourceMappingURL）会让浏览器去线上拉 .map——那是把源码目录结构公开出去
        build: { sourcemap: "hidden" },
        server: {
            ...(port === undefined ? {} : { port }),
            proxy: Object.fromEntries(
                // 同源代理到后端，规避 CORS / refresh cookie（Secure + httpOnly）跨域问题
                proxy.map((prefix) => [prefix, { target: backend, changeOrigin: true }]),
            ),
        },
        plugins: lazyPlugins(() => plugins(backend)),
    }
}
