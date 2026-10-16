import { Truck } from "lucide-react"

import { copyWithNotify } from "@shop/app-kit/display"
import { Button } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

export interface CarrierBarProps {
    carrierName: string
    trackingNo: string
    title?: string
}

export function CarrierBar({ carrierName, trackingNo, title }: CarrierBarProps) {
    const t = useT("logistics")
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
                onClick={() => void copyWithNotify(trackingNo)}
            >
                {t("logistics.carrier.copy")}
            </Button>
        </div>
    )
}
