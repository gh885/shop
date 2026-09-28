/**
 * 程序化滚动的唯一出口，只为一条规则存在：JS 里写死的 `behavior: "smooth"` 会盖过
 * styles.css 的 reduced-motion 兜底（那条只能管 CSS 驱动的滚动），所以「尊重用户的
 * 减少动效偏好」必须在取值这一层做，不能各处手抄。
 */

/** 两个出口都只在事件回调里调用，到得了这里就一定在浏览器，matchMedia 恒在 */
function prefersReducedMotion(): boolean {
    return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function behavior(): ScrollBehavior {
    return prefersReducedMotion() ? "auto" : "smooth"
}

/** 滚到页面顶部 */
export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: behavior() })
}

/** 滚到锚点元素；元素不在（占位路由、区块未渲染）就什么都不做 */
export function scrollToElement(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: behavior(), block: "start" })
}
