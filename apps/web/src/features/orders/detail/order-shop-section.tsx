import { Button } from "@shop/ui-web"

import { fenToYuan } from "@shop/api"

import type { OrderItem } from "#/entities/order"

/**
 * 店铺 + 商品信息区：店铺行（店名 + 查看交易快照）+ 逐条商品行。
 *
 * 每条商品行：主图 + 标题/规格/服务标签 + 单价×数量 + 行小计 + 按状态的操作。
 * 列表接口能直接铺，详情页复用。
 */

const ITEM_ACTIONS: { key: string; label: string; variant?: "default" | "outline" }[] = [
    { key: "add_cart", label: "加入购物车" },
    { key: "after_sale", label: "申请售后" },
]

export interface OrderShopSectionProps {
    order: { shopId: string; shopName: string; payAmount: { amount: number } }
    items: OrderItem[]
    onItemAction?: (item: OrderItem, action: string) => void
}

export function OrderShopSection({ order, items, onItemAction }: OrderShopSectionProps) {
    return (
        <div className="rounded-xl border border-border/60 bg-background">
            {/* 店铺行 */}
            <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
                <span className="inline-flex size-5 items-center justify-center rounded bg-primary text-[11px] font-bold text-primary-foreground">
                    店
                </span>
                <span className="text-sm font-medium text-foreground">{order.shopName}</span>
                <Button
                    variant="link"
                    size="sm"
                    className="ml-auto text-primary"
                >
                    查看交易快照
                </Button>
            </div>

            {/* 商品逐行 */}
            <div className="divide-y divide-border/60">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center gap-4 px-5 py-4"
                    >
                        {/* 主图 */}
                        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                            {item.image && (
                                <img
                                    src={item.image}
                                    alt={item.title}
                                    className="size-full object-cover"
                                />
                            )}
                        </div>

                        {/* 标题/规格/标签 */}
                        <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm text-foreground">{item.title}</p>
                            {item.spec && (
                                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                    {item.spec}
                                </p>
                            )}
                            {item.tags.length > 0 && (
                                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                    {item.tags.join(" ")}
                                </p>
                            )}
                        </div>

                        {/* 单价 × 数量 */}
                        <div className="w-20 shrink-0 text-right text-sm">
                            <span className="font-bold text-foreground">
                                ¥{fenToYuan(item.price.amount)}
                            </span>
                            <span className="ml-1 text-xs text-muted-foreground">
                                x{item.quantity}
                            </span>
                        </div>

                        {/* 行小计 */}
                        <div className="w-20 shrink-0 text-right text-sm font-bold text-foreground">
                            ¥{fenToYuan(item.price.amount * item.quantity)}
                        </div>

                        {/* 按状态操作 */}
                        <div className="flex w-40 shrink-0 flex-col items-end gap-2">
                            {ITEM_ACTIONS.map((a) => (
                                <Button
                                    key={a.key}
                                    variant={a.variant ?? "outline"}
                                    size="sm"
                                    className="min-w-24"
                                    onClick={() => onItemAction?.(item, a.key)}
                                >
                                    {a.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
