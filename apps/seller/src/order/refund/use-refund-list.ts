import { message } from "#/locales/message"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { SellerOrdersApi } from "@shop/api/sdk"

import { afterSaleKeys, afterSaleListKeys, afterSaleListOptions, orderKeys } from "#/order/queries"
import { refundTabToStatus, type RefundTab } from "#/order/refund/model"
import { useRowBusy } from "#/shared/lib/use-row-busy"

/** 工作台的 URL 状态（页签 + 分页）：页签是 URL 词汇（ALL 也是一个页签），wire 词汇只活在数据层里 */
export interface RefundListSearch {
    tab: RefundTab
    page: number
    size: number
}

/** 工作台一个动作的入参：列表行是售后单，但处理端点挂在订单资源下（/seller/orders/{id}/after-sales）——两个 id 都要 */
interface TicketActionArgs {
    /** 售后单 id：只用于「这一行正在处理」的禁用态 */
    ticketId: string
    /** 订单 id：请求要传的那个 */
    orderId: string
}

/**
 * 退款售后工作台的视图模型：URL 同步的分页/页签 + 本店售后单列表 + 三个处理动作。
 * shopId 由路由守卫（ShopGate）保证必有，页面经 useShop() 取到后传入。
 *
 * 动作与订单列表里那套同源（同一个后端端点、同一套提示），差别只在失效范围：
 * 这里的处理会同时改变工作台列表、售后单详情（决策弹窗读它）与订单列表的售后徽章（投影列），
 * 所以三棵树一起失效——少一棵就会出现"这边处理完了、那边还显示待处理"。
 */
export function useRefundList(shopId: string, search: RefundListSearch) {
    const navigate = useNavigate()
    const { busyId, run } = useRowBusy()

    const tickets = useQuery(
        afterSaleListOptions(shopId, {
            status: refundTabToStatus(search.tab),
            page: search.page,
            size: search.size,
        }),
    )

    // React Compiler 已接管缓存：回调不手动 memo，身份由编译器自动稳定
    // URL 那侧的页签键叫 status（路由 schema 认它），hook 内部叫 tab：写回时换算，别把 tab 直接递进 URL
    function apply(next: Partial<RefundListSearch>) {
        void navigate({
            to: "/trade/refund",
            search: {
                status: next.tab ?? search.tab,
                // 换页签回到第一页：留在第 3 页看新页签是空列表，看着像"没有数据"
                page: next.tab === undefined ? search.page : 1,
                size: search.size,
            },
        })
    }

    /** 处理完三处一起失效：工作台列表、售后单详情（决策弹窗读它）、订单列表的售后徽章（投影列） */
    const invalidates = [
        afterSaleListKeys.lists(shopId),
        afterSaleKeys.details(shopId),
        orderKeys.lists(shopId),
    ]

    const agree = useMutation({
        mutationFn: (args: TicketActionArgs) =>
            SellerOrdersApi.agreeAfterSale({ path: { id: args.orderId } }),
        meta: {
            success: message("order.toast.agreeAfterSale"),
            invalidates,
        },
    })

    /** 拒绝多带一项必填理由（AFS-30）：入参形状与另外两个动作不同，但 busy / 失效口径同一套 */
    const reject = useMutation({
        mutationFn: (args: TicketActionArgs & { reason: string }) =>
            SellerOrdersApi.rejectAfterSale({
                path: { id: args.orderId },
                body: { reason: args.reason },
            }),
        meta: {
            success: message("order.toast.rejectAfterSale"),
            invalidates,
        },
    })

    const receive = useMutation({
        mutationFn: (args: TicketActionArgs) =>
            SellerOrdersApi.receiveReturn({ path: { id: args.orderId } }),
        meta: {
            success: message("order.toast.refundConfirmed"),
            invalidates,
        },
    })

    /**
     * busy 以**售后单 id** 为准（表格按 ticket.id 判断该行是否禁用），请求用订单 id。
     * 两个 id 在这里分流，别让表格去猜「行标识」到底是哪一个。
     * 泛型而不是固定 TicketActionArgs：拒绝那一路多带一个 reason，入参形状不该逼三个动作统一。
     */
    const runTicketAction =
        <A extends TicketActionArgs>(action: (args: A) => Promise<unknown>) =>
        (args: A) =>
            run(() => action(args))(args.ticketId)

    return {
        tickets,
        records: tickets.data?.records ?? [],
        total: tickets.data?.total ?? 0,
        busyId,
        handleTabChange: (tab: RefundTab) => apply({ tab }),
        onPageChange: (page: number) => apply({ page }),
        agreeAfterSale: runTicketAction(agree.mutateAsync),
        rejectAfterSale: runTicketAction(reject.mutateAsync),
        receiveReturn: runTicketAction(receive.mutateAsync),
    }
}
