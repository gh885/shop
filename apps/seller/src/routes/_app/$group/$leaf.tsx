import { createFileRoute } from "@tanstack/react-router"

import { PlaceholderPage } from "#/shared/ui/PlaceholderPage"

/** 占位路由：捕获任意「一级/二级」两段路径。
    未命中真实静态路由（如 /product/list、/shop/member）的叶子，
    统一渲染 PlaceholderPage（含用户未实现的 trade/marketing/data 等分组下的条目）。
    静态路由优先于本动态段，故真实页面仍走各自文件。 */
export const Route = createFileRoute("/_app/$group/$leaf")({
    component: GroupLeafPlaceholder,
})

function GroupLeafPlaceholder() {
    return <PlaceholderPage />
}
