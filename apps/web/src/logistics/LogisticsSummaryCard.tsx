import { maskPhone } from "@shop/common"
import { Image } from "@shop/ui-web"

import { maskName } from "./model"

/**
 * 物流摘要卡：主图 + 最新状态 + 目的地城市 + 收货信息。
 *
 * props 全是**处理后的结果**（状态文案由调用方查词表得出），组件不 import SDK 枚举、不推导状态。
 * 例外是掩码：它没有可选分支（只有一种正确掩法），故由本组件直接调出口——号码那份在
 * `@shop/common`（全前端唯一，GEN-51），姓名那份在域内 model.ts。
 */
export interface LogisticsSummaryCardProps {
    /** 最新状态文案，如「已签收」 */
    statusLabel: string
    /** 目的地城市（收货地址里的市），无地址时不传 */
    city?: string
    receiverName: string
    receiverPhone: string
    /** 收货详细地址 */
    address: string
    /** 主图（取订单首个商品，无则留白） */
    thumbnail?: string
}

export function LogisticsSummaryCard({
    statusLabel,
    city,
    receiverName,
    receiverPhone,
    address,
    thumbnail,
}: LogisticsSummaryCardProps) {
    return (
        <div className="flex items-center gap-4 rounded-lg bg-muted/60 p-4">
            <div className="size-14 shrink-0 overflow-hidden rounded-md bg-background">
                <Image
                    src={thumbnail}
                    alt=""
                    className="size-full"
                />
            </div>
            <div className="min-w-0 space-y-0.5">
                <p className="text-base font-bold text-foreground">
                    {statusLabel}
                    {city && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                            {city}
                        </span>
                    )}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                    {maskName(receiverName)} {maskPhone(receiverPhone)}
                </p>
                <p className="truncate text-sm text-muted-foreground">{address}</p>
            </div>
        </div>
    )
}
