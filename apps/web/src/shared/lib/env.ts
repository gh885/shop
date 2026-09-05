import { z } from "zod"

/**
 * 构建期环境变量校验：VITE_ 变量都是弱类型的 string，写错（如打成 htp://）只会在
 * 运行时表现为请求/跳转打到错误地址。这里用 zod 在模块加载时 parse 一次，
 * 非法值 catch 到本地开发默认值——错误被收敛为可预期行为，而不是静默带病运行。
 */

const urlEnv = (fallback: string) => z.url().catch(fallback)

/** SSR loader 拉后端的绝对地址（浏览器端走 Vite proxy 同源，不用它） */
export const BACKEND_URL = urlEnv("http://localhost:8080").parse(import.meta.env.VITE_BACKEND_URL)

/** 卖家中心地址（跨 SPA 跳转用），开发期固定 5000 端口 */
export const SELLER_URL = urlEnv("http://localhost:5000").parse(import.meta.env.VITE_SELLER_URL)
