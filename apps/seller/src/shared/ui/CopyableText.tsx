import { copyWithNotify } from "@shop/app-kit/display"
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

export function CopyableText({
    value,
    label,
    className,
    children = value,
}: {
    value: string
    label?: string
    className?: string
    children?: React.ReactNode
}) {
    const t = useT("common")
    const fieldLabel = label ?? t("common.copy.defaultLabel")
    const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
        // 阻止冒泡：别去掉，否则行内其它点击处理（如选中）会被误触发
        e.stopPropagation()
        await copyWithNotify(value)
    }

    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <button
                        type="button"
                        onClick={copy}
                        aria-label={t("common.copy.ariaLabel", { label: fieldLabel, value })}
                        className={cn(
                            "block w-full min-w-0 max-w-full cursor-pointer text-left",
                            "underline-offset-2 decoration-dotted hover:underline focus-visible:underline focus-visible:outline-none",
                            className,
                        )}
                    >
                        <span className={cn("block truncate")}>{children}</span>
                    </button>
                }
            />
            <TooltipContent>{t("common.copy.tooltip", { label: fieldLabel })}</TooltipContent>
        </Tooltip>
    )
}
