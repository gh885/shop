import { queryOptions, useMutation } from "@tanstack/react-query"
import { SellerAddressesApi, type MerchantAddressRequest } from "@shop/api/sdk"

// address 域 queryKey 工厂（前缀结构一眼可见，invalidate 不漏 key）
const addressKeys = {
    all: ["addresses"] as const,
    lists: (shopId: string) => ["addresses", shopId, "list"] as const,
}

/** 本店地址库列表：shopId 由路由守卫（ShopGate）保证必有，页面经 useShop() 取到后传入。
 *  suspense 形态：页面用 useSuspenseQuery 消费——加载中由路由 pendingComponent 兜住，
 *  失败抛给路由错误页（官方边界 + 重置重试），页面不再手写 isLoading 骨架与错误态。 */
export const addressListOptions = (shopId: string) =>
    queryOptions({
        queryKey: addressKeys.lists(shopId),
        queryFn: () => SellerAddressesApi.listAddresses1(),
    })

/**
 * 本店地址的五个写操作：各自声明成功文案与失效范围（当前店的列表）。
 * 错误归一与提示由全局 MutationCache 负责，这里不写 onError。
 */

/** 新增地址（可同时标记默认发货/默认退货） */
export function useCreateAddress(shopId: string) {
    return useMutation({
        mutationFn: (input: MerchantAddressRequest) =>
            SellerAddressesApi.createAddress1({ body: input }),
        meta: { success: "地址已保存", invalidates: [addressKeys.lists(shopId)] },
    })
}

/** 编辑地址（保留原 id） */
export function useUpdateAddress(shopId: string) {
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: MerchantAddressRequest }) =>
            SellerAddressesApi.updateAddress1({ path: { id }, body: input }),
        meta: { success: "地址已更新", invalidates: [addressKeys.lists(shopId)] },
    })
}

/** 删除地址（软删） */
export function useDeleteAddress(shopId: string) {
    return useMutation({
        mutationFn: (id: string) => SellerAddressesApi.deleteAddress1({ path: { id } }),
        meta: { success: "地址已删除", invalidates: [addressKeys.lists(shopId)] },
    })
}

/** 设为默认发货 */
export function useSetDefaultShip(shopId: string) {
    return useMutation({
        mutationFn: (id: string) => SellerAddressesApi.setDefaultShip({ path: { id } }),
        meta: { success: "已设为默认发货地址", invalidates: [addressKeys.lists(shopId)] },
    })
}

/** 设为默认退货 */
export function useSetDefaultReturn(shopId: string) {
    return useMutation({
        mutationFn: (id: string) => SellerAddressesApi.setDefaultReturn({ path: { id } }),
        meta: { success: "已设为默认退货地址", invalidates: [addressKeys.lists(shopId)] },
    })
}
