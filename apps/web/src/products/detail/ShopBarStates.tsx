import { CircleAlert } from "lucide-react"

import { Button, Skeleton } from "@shop/ui-web"

/**
 * 店铺条（ShopBar）的三个非成功态，按仓库既有的三态约定命名：
 * **Skeleton 加载中 / Error 失败可重试 / 内容本身再带降级**（无 logo 时退字母头像，
 * 那是成功态下的展示降级，留在 ShopBar 里）。
 *
 * 单独成文件而不是塞进 ShopBar.tsx：三态与内容各占一块，改占位/改错误样式时不必翻内容逻辑；
 * 尺寸必须与真实结构同形（`flex h-full items-center gap-3` + 12 号头像 + 右对齐动作区），
 * 否则加载完成的一瞬间会抖一下。
 */

/** 加载中：与真实店铺条同形（头像块 / 店名 / 右侧动作），避免布局跳动 */
export function ShopBarSkeleton() {
    return (
        <div
            className="flex h-full items-center gap-3"
            aria-hidden
        >
            <Skeleton className="size-12 shrink-0 rounded-lg" />
            <Skeleton className="h-5 w-40" />
            <div className="ml-auto flex items-center gap-2">
                <Skeleton className="h-8 w-18 rounded-full" />
                <Skeleton className="h-8 w-18 rounded-full" />
            </div>
        </div>
    )
}

/**
 * 失败：内联一行错误 + 重试。
 * 不用 ui-web 的 `StateError` —— 那是给整块内容区的（`py-16` 的空态卡），
 * 塞进 54px 高的店条会把页面撑变形。整块内容区的失败态（推荐流）才用它。
 *
 * 没有 `retrying` 态：重试由 `QueryBoundary` 的官方 reset 驱动 —— 点下去本区块即卸载、
 * 由 `pending` 骨架接管，不需要按钮自己转圈。
 */
export function ShopBarError({
    message,
    onRetry,
}: {
    /** 后端 detail 优先；后端没说话时是站点那句（apiErrorDetail） */
    message: string
    onRetry: () => void
}) {
    return (
        <div
            role="alert"
            className="flex h-full items-center gap-3 text-sm text-muted-foreground"
        >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-sunken">
                <CircleAlert className="size-5 text-destructive" />
            </div>
            <span
                className="min-w-0 flex-1 truncate"
                title={message}
            >
                {message}
            </span>
            <Button
                variant="outline"
                size="sm"
                shape="pill"
                onClick={onRetry}
            >
                重试
            </Button>
        </div>
    )
}
