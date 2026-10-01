import { Truck } from "lucide-react"

import { copyWithNotify } from "@shop/app-kit/display"
import { Button } from "@shop/ui-web"

/**
 * 承运商条：快递公司 + 运单号 + 复制。
 *
 * 刻意不给「联系电话」：契约里承运商只有 code/name（`CarrierResponse`），
 * 淘宝那条右侧电话是它自己的客服库——没有数据源就留白，不编一个号码上去。
 * 快递公司 logo 同理（无图床），拿中性 Truck 图标占位，不伪造品牌标识。
 */
export interface CarrierBarProps {
    carrierName: string
    trackingNo: string
    /** 逆向回寄包裹：标题改称「退货物流」 */
    title?: string
}

export function CarrierBar({ carrierName, trackingNo, title }: CarrierBarProps) {
    return (
        <div className="flex items-center gap-2 py-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Truck className="size-3.5" />
            </span>
            <span className="text-muted-foreground">{title}</span>
            <span className="font-medium text-foreground">{carrierName}</span>
            <span className="text-muted-foreground tabular-nums">{trackingNo}</span>
            <Button
                variant="ghost"
                size="xs"
                onClick={() => void copyWithNotify(trackingNo, "运单号")}
            >
                复制
            </Button>
        </div>
    )
}
