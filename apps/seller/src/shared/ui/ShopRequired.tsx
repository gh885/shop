import { Store } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@shop/ui-web"

/**
 * ShopRequired —— 「当前店铺上下文缺失」的整页占位。
 *
 * seller 的商品/订单/地址/店员/运费模板等页面都以当前经营店铺为上下文（useCurrentShop），
 * 无 ACTIVE 店铺时统一渲染这块占位，不要各页各写一份。需要额外动作（如「去店铺管理」按钮）
 * 或换文案时，用 children / description 覆盖，不要复制结构。
 */
export function ShopRequired({
    description = "先到「店铺管理」创建店铺或等待审核通过。",
    children,
}: {
    description?: React.ReactNode
    children?: React.ReactNode
}) {
    return (
        <Empty className="py-24">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <Store />
                </EmptyMedia>
                <EmptyTitle>还没有正常营业的店铺</EmptyTitle>
                <EmptyDescription>{description}</EmptyDescription>
                {children}
            </EmptyHeader>
        </Empty>
    )
}
