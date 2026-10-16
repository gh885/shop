import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "src/lib/utils"

/** 进度条（BaseUI Progress 封装）：值→宽度换算与 a11y 语义由 BaseUI 负责，文字由调用方画；调用方至少传 aria-label，否则屏幕阅读器只念出没有对象的数字 */
function Progress({ className, ...props }: ProgressPrimitive.Root.Props) {
    return (
        <ProgressPrimitive.Root
            data-slot="progress"
            className={cn("w-full", className)}
            {...props}
        >
            <ProgressPrimitive.Track
                data-slot="progress-track"
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
                <ProgressPrimitive.Indicator
                    data-slot="progress-indicator"
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                />
            </ProgressPrimitive.Track>
        </ProgressPrimitive.Root>
    )
}

export { Progress }
