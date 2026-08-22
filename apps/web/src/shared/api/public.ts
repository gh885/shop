import { createApiClient } from "@shop/api"

/**
 * 公开接口（匿名可访问，如 /api/products、/api/cms/*、/api/shops/{id}）的 ky 实例。
 *
 * 与 client.ts 的 api 区别：不带登录态，且 SSR 可用——
 * SSR（route loader）无法走 Vite proxy，需显式后端地址（默认 dev 后端，VITE_API_ORIGIN 可覆盖）；
 * 浏览器端保持空串走 proxy 同源相对路径。数据层用法见各 entity 的 actions.ts。
 */
const RAW_API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8080"

export const publicApi = createApiClient(import.meta.env.SSR ? RAW_API_ORIGIN : "").raw
