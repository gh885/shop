import { CircleAlert } from "lucide-react"

import { cn } from "../lib/utils"
import { Button } from "./ui/button"
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "./ui/empty"
import { useUiLabels } from "./ui-labels"

/**
 * 统一错误/空数据状态容器（纯外观，零业务依赖）：调用方在 query isError 时渲染，传入已归一化的 message 与 refetch。
 * 标题/重试用文案从 `UiLabels` 按当前语言取（SSR 首屏即有值，切语言当场变）；message 逐条不同，仍由调用点传入。
 * message 一律走 app-kit 的 errorText，不写 `toApiError(err).detail || 站点那句`：后端没说话时 toApiError 也给非空兜底，`||` 右边轮不上，直接读 detail 会让英文界面漏出后端那句中文。
 */
export function StateError({
    message,
    onRetry,
    retrying = false,
    title,
    retryLabel,
    retryingLabel,
    className,
}: {
    message: string
    /** 不传则隐藏重试按钮 */
    onRetry?: () => void
    retrying?: boolean
    title?: string
    retryLabel?: string
    retryingLabel?: string
    className?: string
}) {
    const labels = useUiLabels().stateError
    const resolvedTitle = title ?? labels.title
    const resolvedRetryLabel = retryLabel ?? labels.retry
    const resolvedRetryingLabel = retryingLabel ?? labels.retrying
    return (
        <Empty className={cn("rounded-lg border-border py-16", className)}>
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <CircleAlert className="size-4 text-destructive" />
                </EmptyMedia>
                <EmptyTitle>{resolvedTitle}</EmptyTitle>
                <EmptyDescription>{message}</EmptyDescription>
            </EmptyHeader>
            {onRetry ? (
                <EmptyContent>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={retrying}
                        onClick={onRetry}
                    >
                        {retrying ? resolvedRetryingLabel : resolvedRetryLabel}
                    </Button>
                </EmptyContent>
            ) : undefined}
        </Empty>
    )
}
