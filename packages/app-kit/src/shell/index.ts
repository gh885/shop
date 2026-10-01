/**
 * shell —— SPA 装配与路由外壳：mountSpa（入口薄包装）、RoutePending / RouteErrorFallback /
 * trackRouteResolved，以及 workbench 外壳（sidebar / topbar / navigation——seller 与 admin
 * 同一形态，入口数据由各 app 注入）。样式走 `@shop/app-kit/workbench.css`。
 */
export { WorkbenchSidebar } from "./workbench/sidebar"
export { WorkbenchTopBar, WorkbenchTopBarAction, WorkbenchAccount } from "./workbench/topbar"
export { activeSectionOf } from "./workbench/navigation"
export type { SidebarItem, SidebarSourceItem } from "./workbench/navigation"
export { mountSpa } from "./spa-entry"
export { trackRouteResolved } from "./route-tracking"
export { RouteErrorFallback } from "./route-error-fallback"
export { RoutePending } from "./route-pending"
export { translateSidebarItems } from "./workbench/navigation"
