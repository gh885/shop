import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/")({
    // 用 beforeLoad redirect，别改成渲染 Navigate：否则与 ShopGate 跳转争抢导航、反复卸载带 layout effect 的侧栏
    beforeLoad: () => {
        throw redirect({
            to: "/product/list",
            search: { page: 1, size: 10 },
            replace: true,
        })
    },
})
