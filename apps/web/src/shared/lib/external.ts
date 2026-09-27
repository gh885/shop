/** 卖家中心地址：独立 SPA（apps/seller），开发期固定 5000 端口；生产用 VITE_SELLER_URL 覆盖 */
export { SELLER_URL } from "./env"

/**
 * 站内路由还是外部应用：渲染成 `<Link>` 还是 `<a>` 的唯一判据。
 *
 * 顶栏导航和页脚都要在「跳去卖家中心」与「跳站内页」之间分岔，判据写两遍迟早分家
 * （一边认 `http`，一边认 `https` 就会有一处外链被 router 当成站内路径吞掉）。
 */
export function isExternalTarget(to: string): boolean {
    return to.startsWith("http")
}
