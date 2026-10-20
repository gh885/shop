import { maskPhone } from "@shop/common/domain"

import { useT } from "#/locales/use-t"
export interface ReceiverLineProps {
    receiverName: string
    receiverPhone: string
    address: string
}

export function ReceiverLine({ receiverName, receiverPhone, address }: ReceiverLineProps) {
    const t = useT("logistics")
    return (
        <div className="flex items-start gap-2 border-t border-border/60 pt-4 text-sm">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-3xs text-muted-foreground">
                {t("logistics.receiver.prefix")}
            </span>
            <span className="text-foreground">
                {receiverName}，{maskPhone(receiverPhone)}，{address}
            </span>
        </div>
    )
}
