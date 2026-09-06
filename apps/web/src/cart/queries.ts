import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CartApi } from "@shop/api/sdk"

import { useIsLoggedIn } from "#/shared/api/auth"
import { notify } from "#/shared/lib/toast"
import { useOptimisticListMutation } from "#/shared/lib/use-optimistic-list"

import {
    MAX_CART_QUANTITY,
    patchItem,
    removeItems,
    setItemsSelected,
    toCartItem,
    type CartItem,
} from "./cart"

/**
 * cart/queries —— 购物车的 React 接线层。只管「读状态/写状态」，
 * 具体规则（派生、变换、映射）都在 ./cart.ts 纯函数里。
 *
 * queryKey 用生成 SDK 的 key 工厂（契约同步、参数类型受检），投影 queryFn 本地保留。
 */

// ---------- 读：查询 + 缓存 ----------

/** 购物车列表缓存 key（并发 query 与所有 mutation 共享，是唯一失效入口） */
const CART_ITEMS_KEY = ["cart-items"] as const

/** 角标计数缓存 key：算的是条目行数（非件数），故只有加购/删除会改变它 */
const CART_COUNT_KEY = ["cart-count"] as const

/** 购物车列表：仅在路由 /cart（_protected 内）使用。
 * 登录态由 _protected 布局 gate 保证（authed 后才渲染子路由），挂载时必已登录。 */
const cartItemsOptions = queryOptions({
    queryKey: CART_ITEMS_KEY,
    queryFn: async ({ signal }): Promise<CartItem[]> => {
        const res = await CartApi.listCartItems({ signal })
        return res.map(toCartItem)
    },
})

export function useCartItems() {
    return useQuery(cartItemsOptions)
}

/** 角标计数：免拉整车，头部角标用；可在公开页（SiteHeader/首页）使用，故必须保留 enabled gating */
const cartCountOptions = queryOptions({
    queryKey: CART_COUNT_KEY,
    queryFn: async ({ signal }): Promise<number> => {
        const res = await CartApi.getCartCount({ signal })
        return res.total
    },
    staleTime: 30_000,
})

export function useCartCount() {
    const isLoggedIn = useIsLoggedIn()
    return useQuery({ ...cartCountOptions, enabled: isLoggedIn })
}

// ---------- 写：乐观 mutation ----------

/** 加购 mutation：成功 toast + 失效角标计数；导航到购物车由调用方决定 */
export function useAddToCart() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ skuId, quantity }: { skuId: string; quantity: number }) =>
            CartApi.addCartItem({ body: { skuId, quantity } }),
        onSuccess: () => {
            notify.success("已加入购物车")
            void qc.invalidateQueries({ queryKey: CART_COUNT_KEY })
        },
        onError: (err) => notify.fromError(err, "加入购物车失败"),
    })
}

/** 改数量（步进器 ±1）；patch 变换语义在 ./cart.ts，这里只接线 */
function useUpdateCartQuantity() {
    return useOptimisticListMutation<CartItem, { id: string; quantity: number }>({
        queryKey: CART_ITEMS_KEY,
        mutationFn: ({ id, quantity }) =>
            CartApi.updateCartItem({ path: { id }, body: { quantity } }),
        patch: (list, { id, quantity }) => patchItem(list, id, { quantity }),
        messages: { error: "修改数量失败" },
    })
}

/** 单条勾选/取消 */
export function useToggleCartItem() {
    return useOptimisticListMutation<CartItem, { id: string; selected: boolean }>({
        queryKey: CART_ITEMS_KEY,
        mutationFn: ({ id, selected }) =>
            CartApi.updateCartItem({ path: { id }, body: { selected } }),
        patch: (list, { id, selected }) => patchItem(list, id, { selected }),
        messages: { error: "勾选失败" },
    })
}

/** 批量勾选：itemIds 省略 = 整车（全选/取消全选），传列表 = 按店铺勾选 */
export function useSelectCartItems() {
    return useOptimisticListMutation<CartItem, { itemIds?: string[]; selected: boolean }>({
        queryKey: CART_ITEMS_KEY,
        mutationFn: ({ itemIds, selected }) =>
            CartApi.updateCartSelected({ body: { itemIds, selected } }),
        patch: (list, { itemIds, selected }) => setItemsSelected(list, itemIds, selected),
        messages: { error: "勾选失败" },
    })
}

/** 删一条 */
function useRemoveCartItem() {
    return useOptimisticListMutation<CartItem, string>({
        queryKey: CART_ITEMS_KEY,
        invalidateKeys: [CART_COUNT_KEY],
        mutationFn: (id) => CartApi.removeCartItem({ path: { id } }),
        patch: (list, id) => removeItems(list, [id]),
        messages: { error: "删除失败" },
    })
}

/** 批量删（删除选中 / 清除失效共用） */
export function useBatchRemoveCartItems() {
    return useOptimisticListMutation<CartItem, string[]>({
        queryKey: CART_ITEMS_KEY,
        invalidateKeys: [CART_COUNT_KEY],
        mutationFn: (itemIds) => CartApi.batchRemoveCartItems({ body: { itemIds } }),
        patch: (list, itemIds) => removeItems(list, itemIds),
        messages: { error: "删除失败" },
    })
}

// ---------- 行内动作 ----------
// 购物车的消费者都在「购物车页」这一棵子树里、没有跨路由复用，所以不用 context 广播派生状态；
// 每个组件自己 `useCartItems()` 拿数据、调 `derive*` 算派生、按需调上面的 mutation。
// 唯一的例外是条目行：整组共用一份实例（在 ShopGroupCard 调一次传给各 ItemRow），
// 否则 N 行会各建 3 个 mutation observer。

export type CartItemActions = ReturnType<typeof useCartItemActions>

export function useCartItemActions() {
    const toggle = useToggleCartItem()
    const updateQty = useUpdateCartQuantity()
    const remove = useRemoveCartItem()

    return {
        /** 正在删除的条目 id（行内删除按钮的 pending 态来源） */
        removingId: remove.isPending ? (remove.variables ?? undefined) : undefined,
        toggleItem: (id: string, selected: boolean) => toggle.mutate({ id, selected }),
        /** 改数量：越界静默拦下、超库存提示（仍以后端裁决为准）；库存取自调用方手上的 item，不回查列表 */
        updateQuantity: (item: CartItem, quantity: number) => {
            if (quantity < 1 || quantity > MAX_CART_QUANTITY) return
            const stock = item.sku.stock
            if (stock > 0 && quantity > stock) {
                notify.info(`最多只能购买 ${stock} 件`)
                return
            }
            updateQty.mutate({ id: item.id, quantity })
        },
        removeItem: (id: string) => remove.mutate(id),
    }
}
