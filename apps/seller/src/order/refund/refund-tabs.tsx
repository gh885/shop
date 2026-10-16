import { Tabs, TabsList, TabsTrigger } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { REFUND_TABS, type RefundTab } from "#/order/refund/model"

export function RefundTabs({
    value,
    onChange,
}: {
    value: RefundTab
    onChange: (tab: RefundTab) => void
}) {
    const t = useT()
    return (
        <Tabs
            value={value}
            onValueChange={(next) => {
                const tab = REFUND_TABS.find((opt) => opt.value === next)?.value
                if (tab) onChange(tab)
            }}
        >
            <TabsList variant="line">
                {REFUND_TABS.map((tab) => (
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
