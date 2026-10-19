import { maskPhone } from "@shop/common/domain"
import { Image } from "@shop/ui-web"

import { maskName } from "./rules"

export interface LogisticsSummaryCardProps {
    statusLabel: string
    city?: string
    receiverName: string
    receiverPhone: string
    address: string
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
