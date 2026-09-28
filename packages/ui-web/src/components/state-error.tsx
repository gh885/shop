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

/**
 * 统一错误/空数据状态容器（HEADLESS UI，纯外观，零业务依赖）。
 * 不带任何错误归一化逻辑（toApiError 属业务契约），只负责"错误 + 重试按钮"的视觉。
 * 调用方（web/seller）在 query isError 时渲染，并把已归一化的 message 与 refetch 传入。
 *
 * 用法（TanStack Query）：
 *   // ① 区块内就地渲染（查询不能进边界：带 enabled / placeholderData / skipToken）
 *   if (query.isError)
 *     return <StateError message={apiErrorDetail(query.error, "规格模板加载失败，请重试")}
 *                        onRetry={() => void query.refetch()} retrying={query.isFetching} />
 *   // ② 作为错误边界的 fallback（推荐）：`reset` 由边界注入，重试走官方的
 *   //    QueryErrorResetBoundary + 边界复位链路
 *   fallback={({ error, reset }) => (
 *     <StateError message={apiErrorDetail(error, "推荐加载失败")} onRetry={reset} />
 *   )}
 *
 * message 一律走 `apiErrorDetail(err, 站点那句)`，不写 `toApiError(err).detail || 站点那句`：
 * 后端没说话时 toApiError 也给得出非空的通用兜底，`||` 右边永远轮不上。
 */
export function StateError({
    message,
    onRetry,
    retrying = false,
    className,
}: {
    /** 已定稿的错误文案（业务侧用 apiErrorDetail(err, 站点那句) 传入） */
    message: string
    /** 重试动作（通常 query.refetch）；不传则隐藏按钮 */
    onRetry?: () => void
    /** 重试进行中：禁用按钮并显示"重试中…" */
    retrying?: boolean
    className?: string
}) {
    return (
        <Empty className={cn("rounded-xl border-border py-16", className)}>
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <CircleAlert className="size-4 text-destructive" />
                </EmptyMedia>
                <EmptyTitle>加载失败</EmptyTitle>
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
                        {retrying ? "重试中…" : "重试"}
                    </Button>
                </EmptyContent>
            ) : undefined}
        </Empty>
    )
}
