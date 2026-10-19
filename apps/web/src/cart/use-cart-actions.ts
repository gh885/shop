import { message } from "#/locales/message"
import { notify } from "@shop/app-kit/data"
import { type CartItem, validateQuantity } from "./rules"
import { useRemoveCartItem, useToggleCartItem, useUpdateCartQuantity } from "./queries"

export type CartItemActions = ReturnType<typeof useCartItemActions>

export function useCartItemActions() {
    const toggle = useToggleCartItem()
    const updateQty = useUpdateCartQuantity()
    const remove = useRemoveCartItem()

    return {
        toggleItem: (id: string, selected: boolean) => toggle.mutate({ id, selected }),
        updateQuantity: (item: CartItem, quantity: number) => {
            const verdict = validateQuantity(item, quantity)
            if (verdict.ok) {
                updateQty.mutate({ id: item.id, quantity })
                return
            }
            if (verdict.reason === "overStock") {
                notify.info(message("cart.toast.maxStock", { stock: verdict.stock }))
            }
        },
        removeItem: (id: string) => remove.mutate(id),
    }
}
