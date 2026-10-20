import { CircleAlert } from "lucide-react"

import { Button, Skeleton } from "@shop/ui-web"
import { useT } from "#/locales/use-t"

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

export function ShopBarError({ message, onRetry }: { message: string; onRetry: () => void }) {
    const t = useT("product")
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
                {t("product.detail.shop.retry")}
            </Button>
        </div>
    )
}
