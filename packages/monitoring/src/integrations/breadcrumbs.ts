/**
 * 面包屑采集插件：把「用户点了什么」记成现场。不单独上报，只随错误信封走，几乎不花流量。
 * 本插件只管点击；路由/接口各有出口（`state.ts` 的 `trackRoute` / `track`），不在这里。内存上限见 `state.ts` 的 `BREADCRUMB_LIMIT`。见 `frontend-monitoring.md` §首批功能。
 */

import type { Integration } from "../types"

/** 可读标签的候选属性，**顺序即优先级** */
const LABEL_ATTRIBUTES = ["aria-label", "title"] as const

/**
 * 捕获阶段监听选项。**加与摘必须同一个形状**：写 `true` 两边不对称——浏览器归一化成 `capture: true`、Node 的 `EventTarget` 不会，
 * 于是 `addEventListener(t,h,true)` 配 `removeEventListener(t,h,true)` 摘不掉，卸载静默失效（实测 Node 24）。
 */
const CAPTURE = { capture: true } as const

/**
 * 点击元素的可读标签。**只采写进模板的标识**（`aria-label`/`title`/`id`），**绝不碰 `textContent`**——渲染文本可能是用户内容/订单号/手机号，
 * 契约第 5 条把边界画在「不采输入框内容」上，最省事的守法就是不读渲染文本。优先级即 `LABEL_ATTRIBUTES` 顺序，三者都没有只留标签名。
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
