import { useEffect } from "react"
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"

import { openLoginDialog, requireAuth, useAuthStatus } from "#/shared/api/auth"

/**
 * 路由级权限：唯一的守卫点（pathless layout，URL 路径不占段）。
 *
 * 买家端登录态只有「已登录 / 未登录」一个维度（页面级足够，不做按钮级权限，见项目约定）。
 * 所有需要登录的页面收进本 layout 目录下，guards 只挂这一处。
 *
 * 双层防护：
 * - beforeLoad / requireAuth：客户端导航进入时裁决，未登录拉起登录 Dialog 并 redirect 首页（不渲染目标页）。
 * - 组件 gate：SSR 直访 / 刷新兜底 —— SSR 阶段无法裁决登录态
 *   （bootstrapAuth 依赖浏览器 localStorage 的 deviceId + httpOnly refresh cookie，服务端进程拿不到），
 *   beforeLoad 直接放行；组件先读取 auth 状态：unknown（未裁决）→ 渲染空、不挂载子路由；
 *   裁决为 authed → 渲染 <Outlet/>；guest → 拉起登录 Dialog 并跳首页。
 *
 * 关键收益：子路由 <Outlet/> 只在 auth 已裁决为 authed 后才渲染。
 * 因此子路由下所有数据 hook 运行时登录态必然已确定、请求必带 token——
 * 受保护页的数据 hook 一律不需要再写 `enabled: isLoggedIn` 之类的手动 gating（根因已消除）。
 */
export const Route = createFileRoute("/_protected")({
    beforeLoad: () => requireAuth(),
    component: ProtectedLayout,
})

function ProtectedLayout() {
    const status = useAuthStatus()
    const navigate = useNavigate()

    // auth 裁决为 guest（未登录）后：拉起登录 Dialog 并跳回首页（不渲染子路由）
    useEffect(() => {
        if (status === "guest") {
            openLoginDialog()
            void navigate({ to: "/" })
        }
    }, [status, navigate])

    // 未裁决（unknown / guest）阶段一律不渲染子路由：
    // 子路由只在 auth 已裁决为 authed 后才挂载，数据 hook 运行时代理必然带 token，无需逐个写 enabled gating
    return status === "authed" ? <Outlet /> : null
}
