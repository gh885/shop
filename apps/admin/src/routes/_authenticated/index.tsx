import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * 管理端首页。
 *
 * <p>重写期唯一稳定的落地页是买家列表；商家审核那一套（`shop-review`）没有后端模块，
 * 它的列表页随域一起删了。这里直接跳过去，不留一个空仪表盘。
 */
export const Route = createFileRoute("/_authenticated/")({
    beforeLoad: () => {
        throw redirect({ to: "/accounts/users" })
    },
})
