import { queryOptions } from "@tanstack/react-query"
import {
    SellerAfterSalesApi,
    SellerLogisticsApi,
    SellerOrdersApi,
    type OrderStatus,
    type TicketStatus,
} from "@shop/api/sdk"
import { toApiError } from "@shop/common/contract"
export interface OrderListSearch {
    status?: OrderStatus
    page: number
    size: number
}

/** 退款售后工作台的查询参数（status 空 = 全部） */
export interface AfterSaleListSearch {
    status?: TicketStatus
    page: number
    size: number
}

// queryKey 工厂：shopId 由路由守卫（ShopGate）保证必有——渲染到这些页面时一定有 ACTIVE 店铺，
// key 里不再出现 undefined，enabled 兜底也可省（守卫在店铺就绪前不渲染业务页）。

export const orderKeys = {
    all: ["orders"] as const,
    lists: (shopId: string) => ["orders", shopId] as const,
    list: (shopId: string, s: OrderListSearch) =>
        ["orders", shopId, s.status ?? "all", s.page, s.size] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
}

/** 订单列表行内的售后动作集（按本页订单批查）：与售后工作台同一份契约下发，前端不按 afterSaleStatus 另推 */
export const afterSaleActionKeys = {
    lists: (shopId: string) => ["after-sale-actions", shopId] as const,
    list: (shopId: string, orderIds: string[]) => ["after-sale-actions", shopId, orderIds] as const,
}

/** 承运商字典与店铺无关，单独一棵 key 树，不进 orders 前缀（失效订单不影响它） */
const carrierKeys = {
    all: ["carriers"] as const,
}

/** 售后单（决策弹窗用）：orderId 为空即不发请求（弹窗关着不该拉数据） */
export const afterSaleKeys = {
    /** 单张售后单详情前缀：[..., shopId] 可一发失效该店全部详情 */
    details: (shopId: string) => ["after-sale", shopId] as const,
    detail: (shopId: string, orderId: string | undefined) =>
        ["after-sale", shopId, orderId] as const,
}

export const shopAfterSaleOptions = (shopId: string, orderId: string | undefined) =>
    queryOptions({
        queryKey: afterSaleKeys.detail(shopId, orderId),
        queryFn: async ({ signal }) => {
            if (!orderId) throw new Error("缺少订单 ID")
            try {
                return await SellerOrdersApi.getShopAfterSale({ path: { id: orderId }, signal })
            } catch (error) {
                // 404 表示当前店铺下查不到售后单，弹窗展示空态；其它错误仍进入错误态。
                // oxlint-disable-next-line no-null -- Query 成功载荷不能是 undefined，用 null 表达查无数据
                if (toApiError(error).status === 404) return null
                throw error
            }
        },
        enabled: !!orderId,
        retry: false,
        // 退出全局的「失败抛给错误边界」：读它的只有售后决策弹窗，头上没有边界。
        // 抛出去会把整个订单列表页换掉——弹窗里的失败不该毁掉背景页
        throwOnError: false,
    })

/** 店铺订单分页列表（shopId 入 key：切店铺不串缓存）。
 *  带 placeholderData（不能走 suspense），失败冒到路由错误页由全局默认接管。 */
export const orderListOptions = (shopId: string, s: OrderListSearch) =>
    queryOptions({
        queryKey: orderKeys.list(shopId, s),
        // 透传 signal：筛选/翻页换 key 后，旧请求不该留在后端跑完（也不该在组件卸载后无人接收）
        queryFn: ({ signal }) =>
            SellerOrdersApi.listShopOrders({
                query: {
                    pageParams: { page: s.page, size: s.size },
                    query: { status: s.status },
                },
                signal,
            }),
        placeholderData: (prev) => prev,
    })

/** 一页订单的售后动作集（一次批查，行内按钮的唯一真相）。
 *  附属读取：失败只意味着「这一行暂时不给售后按钮」，不该把整页换成错误页，故退出全局默认。 */
export const orderAfterSaleActionsOptions = (shopId: string, orderIds: string[]) =>
    queryOptions({
        queryKey: afterSaleActionKeys.list(shopId, orderIds),
        queryFn: ({ signal }) =>
            SellerAfterSalesApi.listAfterSaleActionsByOrders({
                query: { orderIds },
                signal,
            }),
        enabled: orderIds.length > 0,
        placeholderData: (prev) => prev,
        throwOnError: false,
    })

/** 退款售后工作台的列表 key：与订单列表分开两棵树（各失效各的，互不牵连） */
export const afterSaleListKeys = {
    all: ["after-sales"] as const,
    lists: (shopId: string) => ["after-sales", shopId] as const,
    list: (shopId: string, search: AfterSaleListSearch) =>
        ["after-sales", shopId, search.status ?? "all", search.page, search.size] as const,
}

/** 本店售后单分页列表（工作台） */
export const afterSaleListOptions = (shopId: string, search: AfterSaleListSearch) =>
    queryOptions({
        queryKey: afterSaleListKeys.list(shopId, search),
        queryFn: ({ signal }) =>
            SellerAfterSalesApi.listShopAfterSales({
                query: {
                    pageParams: { page: search.page, size: search.size },
                    status: search.status,
                },
                signal,
            }),
        placeholderData: (prev) => prev,
    })

/** 发货下拉的快递公司字典：低频变更的公共字典，长缓存（字典维护是运维动作，不随页面来回拉）。
 *  它是发货弹窗里的一个下拉框，退出全局的「失败抛给错误边界」——字典拉不到顶多选不了承运商。 */
export const carrierListOptions = () =>
    queryOptions({
        queryKey: carrierKeys.all,
        queryFn: () => SellerLogisticsApi.listCarriers(),
        staleTime: 10 * 60_000,
        throwOnError: false,
    })
