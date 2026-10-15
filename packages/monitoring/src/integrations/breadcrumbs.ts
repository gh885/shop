/**
 * 面包屑采集插件：把「用户点了什么」记成现场（`frontend-monitoring.md` 的「现场」条）。
 *
 * 面包屑不单独上报，只随错误信封走（`captureError` 把最近的环形缓冲整段带上）。所以它
 * **几乎不花流量**，换的是「有报错、但复现不了」时唯一能看的线索。
 *
 * 另外两条来源不在这个插件里，因为它们各有自己的出口：
 * - **路由**：`state.ts` 的 `trackRoute` 顺手记（出口就在那儿）
 * - **接口**：`state.ts` 的 `track` 在 `kind === "api"` 时记（同上）
 * 点击没有对应的出口函数，才需要一个监听插件。
 *
 * 内存上限由 `state.ts` 的 `BREADCRUMB_LIMIT`（30 条）管，环形保留，刷新即丢。
 */

import type { Integration } from "../types"

/** 可读标签的候选属性，**顺序即优先级** */
const LABEL_ATTRIBUTES = ["aria-label", "title"] as const

/**
 * 捕获阶段的监听选项。**加与摘必须是同一个形状**：写 `true` 两边不对称——
 * 浏览器按规范会把它归一化成 `capture: true`，Node 的 `EventTarget` 不会，
 * 于是 `addEventListener(t, h, true)` 配 `removeEventListener(t, h, true)` 摘不掉，
 * 卸载静默失效。（实测 Node 24。）
 */
const CAPTURE = { capture: true } as const

/**
 * 点击元素的可读标签。
 *
 * **只采我们自己写进模板的标识**（`aria-label` / `title` / `id`），**不碰 `textContent`**：
 * 页面上渲染出来的文本可能是用户内容、订单号或手机号，而契约第 5 条把边界画在
 * 「不采输入框内容」上——最省事的守法就是根本不读渲染文本。少那点可读性，换的是不必
 * 逐处论证「这串文本里会不会夹着个人信息」。
 *
 * 优先级也是可读性顺序：`aria-label` 通常是 i18n 过的按钮名（读屏用户也靠它），
 * `title` 次之，`id` 是开发者自己的锚点。三者都没有就只留标签名——一个光秃秃的 `div`
 * 也不是没用，至少能看出「点了几次、点到哪儿」的节奏。
 */
function labelOf(el: Element): string {
    const tag = el.tagName.toLowerCase()
    const label = LABEL_ATTRIBUTES.map((name) => el.getAttribute(name)).find(
        (value) => value !== null && value.length > 0,
    )
    const name = label ?? el.id
    return name ? `${tag}: ${name}` : tag
}

export const breadcrumbsIntegration: Integration = {
    name: "breadcrumbs",
    setup({ addBreadcrumb }) {
        if (typeof document === "undefined") return

        const onClick = (event: MouseEvent) => {
            const target = event.target
            // 点到 document / text node 上时没有元素可言，跳过
            if (!(target instanceof Element)) return
            addBreadcrumb("click", labelOf(target))
        }

        // **捕获阶段**：应用里对点击 stopPropagation 的那些（弹窗遮罩、表格行）恰恰是
        // 最想留痕的，挂冒泡阶段会把它们全漏掉
        document.addEventListener("click", onClick, CAPTURE)
        return () => document.removeEventListener("click", onClick, CAPTURE)
    },
}
