import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"

import { groupByShop, type CartItem, type CartShopGroup } from "#/entities/cart"
import { notify } from "#/shared/lib/toast"

import {
    useBatchRemoveCartItems,
    useCartItems,
    useRemoveCartItem,
    useSelectCartItems,
    useToggleCartItem,
    useUpdateCartQuantity,
} from "./use-cart"

/**
 * 购物车全局状态容器：整页包一个 CartProvider，业务逻辑与派生状态全部集中在本 hook。
 *
 * 视图（列表分组、结算明细、工具栏、条目行）只读 useCart() 的结果并调动作，
 * 不直接触碰 mutation/查询，便于后续接结算、锁定等扩展。
 *
 * - 派生：店铺分组、已勾选条目、选中金额（分）、全选/半选
 * - 动作：单选、店铺全选、整车全选、改数量（含库存上限）、删除、批量删除选中
 */
interface CartContextValue {
    items: CartItem[] | undefined
    isPending: boolean
    isError: boolean
    groups: CartShopGroup[]
    /** 已勾选且可售的条目（结算与批量操作基于它） */
    selectedItems: CartItem[]
    /** 选中条目数（条，非件数） */
    selectedCount: number
    /** 选中条目合计金额（分）；无价格的 SKU 按 0 计 */
    selectedTotal: number
    /** 全部可售条目是否都已勾选 */
    allSelected: boolean
    /** 是否部分勾选（全选框半选态） */
    someSelected: boolean
    /** 是否有任意写操作进行中（结算按钮防连点） */
    isMutating: boolean
    toggleItem: (id: string, selected: boolean) => void
    toggleShop: (shopId: string, checked: boolean) => void
    toggleAll: (checked: boolean) => void
    updateQuantity: (id: string, quantity: number) => void
    removeItem: (id: string) => void
    removeSelected: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
    const cart = useCartItems()
    const selectItems = useSelectCartItems()
    const toggle = useToggleCartItem()
    const updateQty = useUpdateCartQuantity()
    const remove = useRemoveCartItem()
    const batchRemove = useBatchRemoveCartItems()

    const items = cart.data
    const groups = useMemo(() => groupByShop(items ?? []), [items])

    const selectedItems = useMemo(
        () => (items ?? []).filter((i) => i.available && i.selected),
        [items],
    )
    const selectedCount = selectedItems.length
    const selectedTotal = useMemo(
        () => selectedItems.reduce((sum, i) => sum + (i.sku?.price?.amount ?? 0) * i.quantity, 0),
        [selectedItems],
    )

    const availableItems = useMemo(() => (items ?? []).filter((i) => i.available), [items])
    const allSelected = availableItems.length > 0 && availableItems.every((i) => i.selected)
    const someSelected = availableItems.some((i) => i.selected)

    const isMutating =
        selectItems.isPending ||
        toggle.isPending ||
        updateQty.isPending ||
        remove.isPending ||
        batchRemove.isPending

    const handleToggleItem = useCallback(
        (id: string, selected: boolean) => toggle.mutate({ id, selected }),
        [toggle],
    )

    const handleToggleShop = useCallback(
        (shopId: string, checked: boolean) => {
            const ids =
                groups
                    .find((g) => g.shopId === shopId)
                    ?.items.filter((i) => i.available)
                    .map((i) => i.id) ?? []
            selectItems.mutate({ itemIds: ids, selected: checked })
        },
        [groups, selectItems],
    )

    const handleToggleAll = useCallback(
        (checked: boolean) => selectItems.mutate({ itemIds: undefined, selected: checked }),
        [selectItems],
    )

    /** 改数量：越界/超库存直接拦下并提示，真正发请求的增量在 mutation 内 */
    const handleUpdateQuantity = useCallback(
        (id: string, quantity: number) => {
            if (quantity < 1 || quantity > 999) return
            const stock = items?.find((i) => i.id === id)?.sku?.stock ?? 0
            if (stock > 0 && quantity > stock) {
                notify.info(`最多只能购买 ${stock} 件`)
                return
            }
            updateQty.mutate({ id, quantity })
        },
        [items, updateQty],
    )

    const handleRemoveItem = useCallback((id: string) => remove.mutate(id), [remove])

    const handleRemoveSelected = useCallback(() => {
        if (selectedItems.length === 0) return
        batchRemove.mutate(selectedItems.map((i) => i.id))
    }, [selectedItems, batchRemove])

    const value = useMemo<CartContextValue>(
        () => ({
            items,
            isPending: cart.isPending,
            isError: cart.isError,
            groups,
            selectedItems,
            selectedCount,
            selectedTotal,
            allSelected,
            someSelected,
            isMutating,
            toggleItem: handleToggleItem,
            toggleShop: handleToggleShop,
            toggleAll: handleToggleAll,
            updateQuantity: handleUpdateQuantity,
            removeItem: handleRemoveItem,
            removeSelected: handleRemoveSelected,
        }),
        [
            items,
            cart.isPending,
            cart.isError,
            groups,
            selectedItems,
            selectedCount,
            selectedTotal,
            allSelected,
            someSelected,
            isMutating,
            handleToggleItem,
            handleToggleShop,
            handleToggleAll,
            handleUpdateQuantity,
            handleRemoveItem,
            handleRemoveSelected,
        ],
    )

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
    const ctx = useContext(CartContext)
    if (!ctx) throw new Error("useCart 必须在 <CartProvider> 内使用")
    return ctx
}
