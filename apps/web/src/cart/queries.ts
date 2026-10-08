import { message } from "#/locales/message"
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import { CartApi } from "@shop/api/sdk"

import { useIsLoggedIn } from "#/shared/api/auth"
import { notify, optimisticListMutationOptions } from "@shop/app-kit/data"
import { MAX_CART_QUANTITY, patchItem, removeItems, setItemsSelected, type CartItem } from "./cart"
import { toCartItem } from "./mapper"

/**
 * cart/queries —— 购物车的 React 接线层。只管「读状态/写状态」，
 * 具体规则（派生、变换）都在 ./cart.ts 纯函数里，wire 投影在 ./mapper.ts。
 *
 * queryKey 用生成 SDK 的 key 工厂（契约同步、参数类型受检），投影 queryFn 本地保留。
 */

// 读：查询 + 缓存
/** 购物车列表缓存 key（并发 query 与所有 mutation 共享，是唯一失效入口；checkout 下单后也引用它失效） */
export const CART_ITEMS_KEY = ["cart-items"] as const

/** 角标计数缓存 key：算的是条目行数（非件数），故只有加购/删除会改变它 */
export const CART_COUNT_KEY = ["cart-count"] as const

/** 购物车列表：仅在路由 /cart（_protected 内）使用。
 * 登录态由 _protected 布局 gate 保证（authed 后才渲染子路由），挂载时必已登录。
 * 导出供 route loader 客户端预热（hover intent 预取），组件直接 `useQuery(cartItemsOptions)`。 */
export const cartItemsOptions = queryOptions({
    queryKey: CART_ITEMS_KEY,
    queryFn: async ({ signal }): Promise<CartItem[]> => {
        const res = await CartApi.listCartItems({ signal })
        return res.map(toCartItem)
    },
})

/** 角标计数：免拉整车，头部角标用；可在公开页（SiteHeader/首页）使用，故必须保留 enabled gating */
const cartCountOptions = queryOptions({
    queryKey: CART_COUNT_KEY,
    queryFn: async ({ signal }): Promise<number> => {
        const res = await CartApi.getCartCount({ signal })
        return res.total
    },
    staleTime: 30_000,
    // 退出全局的「失败抛给错误边界」：这是页头里一个数字角标，头上没有边界。
    // 让它抛等于「角标接口抖一下就把整页换掉」
    throwOnError: false,
})

export function useCartCount() {
    const isLoggedIn = useIsLoggedIn()
    return useQuery({ ...cartCountOptions, enabled: isLoggedIn })
}

// 写：乐观 mutation
/** 加购 mutation：成功 toast + 失效角标计数；导航到购物车由调用方决定 */
export function useAddToCart() {
    return useMutation({
        mutationFn: ({ skuId, quantity }: { skuId: string; quantity: number }) =>
            CartApi.addCartItem({ body: { skuId, quantity } }),
        meta: {
            success: message("cart.toast.added"),
            error: message("cart.toast.addFailed"),
            invalidates: [CART_COUNT_KEY],
        },
    })
}

/** 改数量（步进器 ±1）；patch 变换语义在 ./cart.ts，这里只接线 */
function useUpdateCartQuantity() {
    return useMutation(
        optimisticListMutationOptions<CartItem, { id: string; quantity: number }>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: ({ id, quantity }) =>
                CartApi.updateCartItem({ path: { id }, body: { quantity } }),
            patch: (list, { id, quantity }) => patchItem(list, id, { quantity }),
            meta: { error: message("cart.toast.updateQtyFailed") },
        }),
    )
}

/** 单条勾选/取消 */
export function useToggleCartItem() {
    return useMutation(
        optimisticListMutationOptions<CartItem, { id: string; selected: boolean }>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: ({ id, selected }) =>
                CartApi.updateCartItem({ path: { id }, body: { selected } }),
            patch: (list, { id, selected }) => patchItem(list, id, { selected }),
            meta: { error: message("cart.toast.toggleFailed") },
        }),
    )
}

/** 批量勾选：itemIds 省略 = 整车（全选/取消全选），传列表 = 按店铺勾选 */
export function useSelectCartItems() {
    return useMutation(
        optimisticListMutationOptions<CartItem, { itemIds?: string[]; selected: boolean }>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: ({ itemIds, selected }) =>
                CartApi.updateCartSelected({ body: { itemIds, selected } }),
            patch: (list, { itemIds, selected }) => setItemsSelected(list, itemIds, selected),
            meta: { error: message("cart.toast.toggleFailed") },
        }),
    )
}

/** 删一条 */
function useRemoveCartItem() {
    return useMutation(
        optimisticListMutationOptions<CartItem, string>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: (id) => CartApi.removeCartItem({ path: { id } }),
            patch: (list, id) => removeItems(list, [id]),
            meta: { error: message("cart.toast.removeFailed"), invalidates: [CART_COUNT_KEY] },
        }),
    )
}

/** 批量删（删除选中 / 清除失效共用） */
export function useBatchRemoveCartItems() {
    return useMutation(
        optimisticListMutationOptions<CartItem, string[]>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: (itemIds) => CartApi.batchRemoveCartItems({ body: { itemIds } }),
            patch: (list, itemIds) => removeItems(list, itemIds),
            meta: { error: message("cart.toast.removeFailed"), invalidates: [CART_COUNT_KEY] },
        }),
    )
}

// 行内动作// 购物车的消费者都在「购物车页」这一棵子树里、没有跨路由复用，所以不用 context 广播派生状态；
// 每个组件自己 `useQuery(cartItemsOptions)` 拿数据、调 `derive*` 算派生、按需调上面的 mutation。
// 唯一的例外是条目行：整组共用一份实例（在 ShopGroupCard 调一次传给各 ItemRow），
// 否则 N 行会各建 3 个 mutation observer。

export type CartItemActions = ReturnType<typeof useCartItemActions>

export function useCartItemActions() {
    const toggle = useToggleCartItem()
    const updateQty = useUpdateCartQuantity()
    const remove = useRemoveCartItem()

    return {
        toggleItem: (id: string, selected: boolean) => toggle.mutate({ id, selected }),
        /** 改数量：越界静默拦下、超库存提示（仍以后端裁决为准）；库存取自调用方手上的 item，不回查列表 */
        updateQuantity: (item: CartItem, quantity: number) => {
            if (quantity < 1 || quantity > MAX_CART_QUANTITY) return
            // SKU 已删则库存未知：按「不设上限」放行，后端仍是最终裁决（置灰行本就走不到这里）
            const stock = item.sku?.stock ?? 0
            if (stock > 0 && quantity > stock) {
                notify.info(message("cart.toast.maxStock", { stock }))
                return
            }
            updateQty.mutate({ id: item.id, quantity })
        },
        removeItem: (id: string) => remove.mutate(id),
    }
}
