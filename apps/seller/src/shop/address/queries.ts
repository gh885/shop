import { queryOptions, useMutation, useSuspenseQuery } from "@tanstack/react-query"
import { SellerAddressesApi, type MerchantAddressRequest } from "@shop/api/sdk"

// address 域 queryKey 工厂（前缀结构一眼可见，invalidate 不漏 key）
const addressKeys = {
    all: ["addresses"] as const,
    lists: (shopId: string) => ["addresses", shopId, "list"] as const,
}

/** 本店地址库列表：shopId 由路由守卫（ShopGate）保证必有，页面经 useShop() 取到后传入。
 *  suspense 形态：加载中由路由 pendingComponent 兜住，失败抛给路由错误页（官方边界 + 重置重试），
 *  页面不再手写 isLoading 骨架与错误态。 */
const addressListOptions = (shopId: string) =>
    queryOptions({
        queryKey: addressKeys.lists(shopId),
        queryFn: () => SellerAddressesApi.listAddresses1(),
    })

export function useAddressList(shopId: string) {
    return useSuspenseQuery(addressListOptions(shopId))
}

/**
 * 本店地址的五个写操作只差 mutationFn 与成功文案：
 * 失效 key（含当前店铺）、toast 文案、错误归一全部由全局 meta 与 MutationCache 处理。
 */
function useAddressMutation<TInput>(
    shopId: string,
    mutationFn: (input: TInput) => Promise<unknown>,
    success: string,
) {
    return useMutation({
        mutationFn,
        meta: { success, invalidates: [addressKeys.lists(shopId)] },
    })
}

/** 新增地址（可同时标记默认发货/默认退货） */
export function useCreateAddress(shopId: string) {
    return useAddressMutation(
        shopId,
        (input: MerchantAddressRequest) => SellerAddressesApi.createAddress1({ body: input }),
        "地址已保存",
    )
}

/** 编辑地址（保留原 id） */
export function useUpdateAddress(shopId: string) {
    return useAddressMutation(
        shopId,
        ({ id, input }: { id: string; input: MerchantAddressRequest }) =>
            SellerAddressesApi.updateAddress1({ path: { id }, body: input }),
        "地址已更新",
    )
}

/** 删除地址（软删） */
export function useDeleteAddress(shopId: string) {
    return useAddressMutation(
        shopId,
        (id: string) => SellerAddressesApi.deleteAddress1({ path: { id } }),
        "地址已删除",
    )
}

/** 设为默认发货 */
export function useSetDefaultShip(shopId: string) {
    return useAddressMutation(
        shopId,
        (id: string) => SellerAddressesApi.setDefaultShip({ path: { id } }),
        "已设为默认发货地址",
    )
}

/** 设为默认退货 */
export function useSetDefaultReturn(shopId: string) {
    return useAddressMutation(
        shopId,
        (id: string) => SellerAddressesApi.setDefaultReturn({ path: { id } }),
        "已设为默认退货地址",
    )
}
