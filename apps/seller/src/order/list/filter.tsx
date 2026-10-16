import { Tabs, TabsList, TabsTrigger } from "@shop/ui-web"
import type { OrderStatus } from "@shop/api/sdk"

import { useT } from "#/locales/use-t"
import { ORDER_STATUS_TABS } from "#/order/constants"

export function OrderFilterBar({
    value,
    onChange,
}: {
    value: OrderStatus | undefined
    onChange: (status: OrderStatus | undefined) => void
}) {
    const t = useT()
    return (
        <Tabs
            value={value ?? ""}
            onValueChange={(next) => {
                const status = ORDER_STATUS_TABS.find((tab) => tab.value === next)?.value
                onChange(status === "" ? undefined : status)
            }}
        >
            <TabsList variant="line">
                {ORDER_STATUS_TABS.map((tab) => (
                    <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                    >
                        {t(tab.labelKey)}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    )
}
