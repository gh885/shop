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
 *     return <StateError
 *                message={errorText(toApiError(query.error), locale, t("common.loadFailed.specTemplate"))}
 *                onRetry={() => void query.refetch()} retrying={query.isFetching} />
 *   // ② 作为错误边界的 fallback（推荐）：直接套 app-kit 的 <QueryBoundary fallback={t("…")} />，
 *   //    它把 QueryErrorResetBoundary + 边界复位链路和这条取文案链一次接好，别手写
 *
 * message 一律走 app-kit 的 `errorText(err, locale, 站点那句)`（i18n.md §7.3 那条链），
 * 不写 `toApiError(err).detail || 站点那句`：后端没说话时 toApiError 也给得出非空的通用兜底，
 * `||` 右边永远轮不上；而直接读 detail 的，英文界面就漏出后端那句中文。
 */
/**
 * 错误/空态容器文案的语言中立默认：由 app-kit 的 I18nProvider 挂载时用 `configureStateErrorLabels`
 * 注入 catalog 那一份（同 confirm / search-bar 的机制）。message 是逐条不同的业务文案，仍由调用点传入。
 */
const defaultLabels = { title: "", retry: "", retrying: "" }

/** 注入这一层壳的本地化文案（切语言随 t() 再调一次） */
export function configureStateErrorLabels(labels: Partial<typeof defaultLabels>) {
    Object.assign(defaultLabels, labels)
}

export function StateError({
    message,
    onRetry,
    retrying = false,
    title = defaultLabels.title,
    retryLabel = defaultLabels.retry,
    retryingLabel = defaultLabels.retrying,
    className,
}: {
    /** 已定稿的错误文案（业务侧用 errorText(err, locale, 站点那句) 传入） */
    message: string
    /** 重试动作（通常 query.refetch）；不传则隐藏按钮 */
    onRetry?: () => void
    /** 重试进行中：禁用按钮并显示"重试中…" */
    retrying?: boolean
    /** 标题；不传则取 configureStateErrorLabels 注入的那份 */
    title?: string
    /** 重试按钮文案；不传则取注入的那份 */
    retryLabel?: string
    /** 重试进行中的按钮文案；不传则取注入的那份 */
    retryingLabel?: string
    className?: string
}) {
    return (
        <Empty className={cn("rounded-xl border-border py-16", className)}>
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <CircleAlert className="size-4 text-destructive" />
                </EmptyMedia>
                <EmptyTitle>{title}</EmptyTitle>
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
                        {retrying ? retryingLabel : retryLabel}
                    </Button>
                </EmptyContent>
            ) : undefined}
        </Empty>
    )
}
