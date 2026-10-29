import { Tabs, TabsList, TabsTrigger } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { RMA_TABS } from "#/domains/order/refund/constants"
import type { RmaTab } from "#/domains/order/refund/search"

export function RmaTabs({ value, onChange }: { value: RmaTab; onChange: (tab: RmaTab) => void }) {
    const t = useT()
    return (
        <Tabs
            value={value}
            onValueChange={(next) => {
                const tab = RMA_TABS.find((opt) => opt.value === next)?.value
                if (tab) onChange(tab)
            }}
        >
            <TabsList variant="line">
                {RMA_TABS.map((tab) => (
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
