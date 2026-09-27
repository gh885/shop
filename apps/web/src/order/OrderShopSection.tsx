import { Button, Image, Panel, PanelContent, PanelHeader } from "@shop/ui-web"

import { Price } from "#/shared/ui/Price"

import { ORDER_ITEM_ACTIONS } from "./constants"
import { orderItemKey, type OrderItem } from "./model"

/**
 * 店铺 + 商品信息区：店铺行（店名 + 查看交易快照）+ 逐条商品行。
 *
 * 每条商品行：主图 + 标题/规格/服务标签 + 单价×数量 + 行小计 + 按状态的操作。
 * 列表接口能直接铺，详情页复用。
 */

export interface OrderShopSectionProps {
    /** 本区只需店名（店名可空 = 店铺已关闭） */
    order: { shopName: string | null }
    items: OrderItem[]
    /**
     * 是否给出「申请售后」入口：由订单详情页按售后申请门槛推导。
     * 门槛不成立时按钮整条不渲染，而不是渲染成禁用灰——买家问的是「这单还能不能申请」，
     * 一个永远点不动的按钮只会逼他猜原因。
     */
    canApplyAfterSale?: boolean
    /** 只回传动作：商品行由页面持有（order.items），不绕组件一圈 */
    onItemAction?: (action: string) => void
}

export function OrderShopSection({
    order,
    items,
    canApplyAfterSale = false,
    onItemAction,
}: OrderShopSectionProps) {
    const itemActions = ORDER_ITEM_ACTIONS.filter(
        (a) => a.key !== "after_sale" || canApplyAfterSale,
    )
    return (
        <Panel>
            {/* 店铺行：店徽 + 店名是一组（组内 8px），与右侧「查看交易快照」拉开靠页头基类的 gap-4 */}
            <PanelHeader>
                <div className="flex items-center gap-2">
                    <span className="inline-flex size-5 items-center justify-center rounded bg-secondary text-xs font-bold text-secondary-foreground">
                        店
                    </span>
                    <span className="text-sm font-medium text-foreground">
                        {order.shopName ?? "店铺已关闭"}
                    </span>
                </div>
                <Button
                    variant="link"
                    size="sm"
                    className="ml-auto"
                >
                    查看交易快照
                </Button>
            </PanelHeader>

            {/* 商品逐行 */}
            <PanelContent>
                {items.map((item) => (
                    <div
                        key={orderItemKey(item)}
                        className="flex items-center gap-4 px-5 py-4"
                    >
                        {/* 主图 */}
                        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                            <Image
                                src={item.image}
                                alt={item.title}
                                className="size-full"
                            />
                        </div>

                        {/* 标题 */}
                        <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm text-foreground">{item.title}</p>
                        </div>

                        {/* 单价 × 数量 */}
                        <div className="w-20 shrink-0 text-right text-sm">
                            <Price
                                value={item.price}
                                className="text-foreground"
                            />
                            <span className="ml-1 text-xs text-muted-foreground">
                                x{item.quantity}
                            </span>
                        </div>

                        {/* 行小计 */}
                        <div className="w-20 shrink-0 text-right text-sm">
                            <Price
                                value={item.amount}
                                className="text-foreground"
                            />
                        </div>

                        {/* 按状态操作 */}
                        <div className="flex w-40 shrink-0 flex-col items-end gap-2">
                            {itemActions.map((a) => (
                                <Button
                                    key={a.key}
                                    variant="outline"
                                    size="sm"
                                    className="min-w-24"
                                    onClick={() => onItemAction?.(a.key)}
                                >
                                    {a.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                ))}
            </PanelContent>
        </Panel>
    )
}
