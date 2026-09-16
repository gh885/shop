import { z } from "zod"

/**
 * 构建期环境变量校验：VITE_ 变量都是弱类型的 string，写错（如打成 htp://）只会在
 * 运行时表现为请求/跳转打到错误地址。这里用 zod 在模块加载时 parse 一次，
 * 非法值 catch 到本地开发默认值——错误被收敛为可预期行为，而不是静默带病运行。
 */

const urlEnv = (fallback: string) => z.url().catch(fallback)

/** origin 专用：URL 解析后取 .origin，丢掉路径与结尾斜杠（router 的 origin 选项要求这种形状） */
const originEnv = (fallback: string) =>
    z
        .url()
        .transform((value) => new URL(value).origin)
        .catch(fallback)

/** SSR loader 拉后端的绝对地址（浏览器端走 Vite proxy 同源，不用它） */
export const BACKEND_URL = urlEnv("http://localhost:8080").parse(import.meta.env.VITE_BACKEND_URL)

/** 卖家中心地址（跨 SPA 跳转用），开发期固定 5000 端口 */
export const SELLER_URL = urlEnv("http://localhost:5000").parse(import.meta.env.VITE_SELLER_URL)

/**
 * 站点权威 origin（无路径、无结尾斜杠）：canonical / og:url 等绝对 URL 的唯一来源。
 *
 * 同时喂给 router 的 origin 选项——SSR 阶段用它作为解析绝对 URL 的基准（否则回退 http://localhost，
 * 会把 localhost 写进 meta 和 redirect 的 Location）。staging / preview 各配各的域名即可。
 */
export const SITE_ORIGIN = originEnv("http://localhost:3000").parse(
    import.meta.env.VITE_SITE_ORIGIN,
)
