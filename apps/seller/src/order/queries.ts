import { queryOptions } from "@tanstack/react-query"
import {
    SellerRefundsApi,
    SellerLogisticsApi,
    SellerOrdersApi,
    type OrderStatus,
    type RefundStatus,
} from "@shop/api/sdk"
import { toApiError } from "@shop/common/contract"
export interface OrderListSearch {
    status?: OrderStatus
    page: number
    size: number
}

export interface RefundListSearch {
    status?: RefundStatus
    page: number
    size: number
}

// shopId 由路由守卫（ShopGate）保证必有：key 里不出现 undefined，enabled 兜底可省
export const orderKeys = {
    all: ["orders"] as const,
    lists: (shopId: string) => ["orders", shopId] as const,
    list: (shopId: string, s: OrderListSearch) =>
        ["orders", shopId, s.status ?? "all", s.page, s.size] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
}

// 售后动作集由后端下发：前端不按 afterSaleStatus 自推（与工作台同源）
export const afterSaleActionKeys = {
    lists: (shopId: string) => ["after-sale-actions", shopId] as const,
    list: (shopId: string, orderIds: string[]) => ["after-sale-actions", shopId, orderIds] as const,
}

// 承运商与店铺无关：独立 key 树，失效 orders 不影响它
const carrierKeys = {
    all: ["carriers"] as const,
}

export const afterSaleKeys = {
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
                return await SellerOrdersApi.getShopRefund({ path: { id: orderId }, signal })
            } catch (error) {
                // 404 = 该店查无售后单（null 走空态），其它错误照常进错误态
                // oxlint-disable-next-line no-null -- Query 成功载荷不能是 undefined，用 null 表达查无数据
                if (toApiError(error).status === 404) return null
                throw error
            }
        },
        enabled: !!orderId,
        retry: false,
        // throwOnError:false：读它的只有决策弹窗，抛出去会把整张订单列表页换成错误页
        throwOnError: false,
    })

export const orderListOptions = (shopId: string, s: OrderListSearch) =>
    queryOptions({
        queryKey: orderKeys.list(shopId, s),
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

export const orderAfterSaleActionsOptions = (shopId: string, orderIds: string[]) =>
    queryOptions({
        queryKey: afterSaleActionKeys.list(shopId, orderIds),
        queryFn: ({ signal }) =>
            SellerRefundsApi.listRefundActionsByOrders({
                query: { orderIds },
                signal,
            }),
        enabled: orderIds.length > 0,
        placeholderData: (prev) => prev,
        throwOnError: false,
    })

export const afterSaleListKeys = {
    all: ["after-sales"] as const,
    lists: (shopId: string) => ["after-sales", shopId] as const,
    list: (shopId: string, search: RefundListSearch) =>
        ["after-sales", shopId, search.status ?? "all", search.page, search.size] as const,
}

export const afterSaleListOptions = (shopId: string, search: RefundListSearch) =>
    queryOptions({
        queryKey: afterSaleListKeys.list(shopId, search),
        queryFn: ({ signal }) =>
            SellerRefundsApi.listShopRefunds({
                query: {
                    pageParams: { page: search.page, size: search.size },
                    status: search.status,
                },
                signal,
            }),
        placeholderData: (prev) => prev,
    })

export const carrierListOptions = () =>
    queryOptions({
        queryKey: carrierKeys.all,
        queryFn: () => SellerLogisticsApi.listCarriers(),
        staleTime: 10 * 60_000,
        throwOnError: false,
    })
