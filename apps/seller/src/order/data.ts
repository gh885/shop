import { SellerLogisticsApi, SellerOrdersApi, type OrderStatus } from "@shop/api/sdk"

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

/** 发货下拉的快递公司：后端只返回启用的，已按字典 sort_no 排好。 */
export function listCarriers() {
    return SellerLogisticsApi.listCarriers()
}
