import { Tabs, TabsList, TabsTrigger } from "@shop/ui-web"
import type { OrderStatus } from "@shop/api/sdk"

import { ORDER_STATUS_TABS } from "#/order/constants"

/**
 * 订单列表筛选栏（页签）：全部 + 五个履约主状态。
 * 受控组件：当前状态由容器经 value 传入（容器负责 URL 读写），切换即时提交。
 * 用 ORDER_STATUS_TABS 收窄，加状态只改 tabs 一处。
 */
export function OrderFilterBar({
    value,
    onChange,
}: {
    value: OrderStatus | undefined
    onChange: (status: OrderStatus | undefined) => void
}) {
    return (
        <Tabs
            value={value ?? ""}
            onValueChange={(next) => {
                onChange(next === "" ? undefined : (next as OrderStatus))
            }}
        >
            <TabsList variant="line">
                {ORDER_STATUS_TABS.map((tab) => (
                    <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                    >
                        {tab.label}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    )
}
