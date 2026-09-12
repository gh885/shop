import {
    SellerAfterSalesApi,
    SellerLogisticsApi,
    SellerOrdersApi,
    type OrderStatus,
    type TicketStatus,
} from "@shop/api/sdk"
import { toApiError } from "@shop/common"

/** 店铺订单分页：按状态筛选，createdAt 倒序（后端固定）。 */
export async function listOrders(search: { page: number; size: number; status?: OrderStatus }) {
    const page = await SellerOrdersApi.listShopOrders({
        query: {
            pageParams: { page: search.page, size: search.size },
            query: { status: search.status },
        },
    })
    return { records: page.records, total: page.total }
}

/** 本店售后单分页（退款售后工作台）：status 空 = 全部，createdAt 倒序（后端固定）。 */
export async function listAfterSaleTickets(search: {
    page: number
    size: number
    status?: TicketStatus
}) {
    const page = await SellerAfterSalesApi.listShopAfterSales({
        query: {
            pageParams: { page: search.page, size: search.size },
            status: search.status,
        },
    })
    return { records: page.records, total: page.total }
}

/**
 * 本店某订单最近一张售后单（含终态）。
 * 404 = 这单没有售后记录（列表里的售后徽章来自订单投影列，可能已过期）——归零为 null，
 * 不当作错误：卖家点开决策弹窗时拿不到售后单，只是少一层上下文，不该让人点不动。
 */
export async function getShopAfterSale(orderId: string) {
    try {
        return await SellerOrdersApi.getShopAfterSale({ path: { id: orderId } })
    } catch (error) {
        if (toApiError(error).status === 404) return null
        throw error
    }
}

/** 发货下拉的快递公司：后端只返回启用的，已按字典 sort_no 排好。 */
export function listCarriers() {
    return SellerLogisticsApi.listCarriers()
}
