import { Tabs, TabsList, TabsTrigger } from "@shop/ui-web"

import { REFUND_TABS, type RefundTab } from "#/order/refund/model"

/**
 * 工作台筛选栏（页签）：待处理 / 退货中 / 已退款 / 已拒绝 / 已撤销 / 全部。
 * 受控组件：当前页签由容器经 value 传入（容器负责 URL 读写），切换即时提交。
 */
export function RefundTabs({
    value,
    onChange,
}: {
    value: RefundTab
    onChange: (tab: RefundTab) => void
}) {
    return (
        <Tabs
            value={value}
            onValueChange={(next) => {
                const tab = REFUND_TABS.find((t) => t.value === next)?.value
                if (tab) onChange(tab)
            }}
        >
            <TabsList variant="line">
                {REFUND_TABS.map((tab) => (
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
