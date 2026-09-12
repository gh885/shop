import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "src/lib/utils"

/**
 * Progress —— 进度条（BaseUI Progress 的样式封装）。
 *
 * 只做可视化：值 → 宽度的换算由 BaseUI Indicator 负责（`value`/`max` 传进来即可），
 * 「已发放 30 / 100」这类文字由调用方自己画——进度条不该替业务决定口径。
 * 无障碍语义（role=progressbar、aria-valuenow/max）由 BaseUI 提供，
 * 调用方至少要传 `aria-label`，否则屏幕阅读器只会念出一个没有对象的数字。
 */
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
