import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/")({
    // 首页只负责选落点，不挂载 Navigate：避免它与 ShopGate 的无营业店铺跳转
    // 在同一次渲染中争抢导航、反复卸载带 layout effect 的折叠侧栏。
    beforeLoad: () => {
        throw redirect({
            to: "/product/list",
            search: { page: 1, size: 10 },
            replace: true,
        })
    },
})
