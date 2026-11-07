import { useT } from "#/locales/use-t"
import { imgUrl } from "#/shared/lib/image"
import { TimeText } from "@shop/app-kit/display"
import { Badge, Button, Image } from "@shop/ui-web"
import { cn } from "@shop/ui-web"

import type { ReviewItem } from "./rules"

function specLine(specValues: string | null): string | null {
    if (!specValues) return null
    try {
        const parsed: unknown = JSON.parse(specValues)
        if (!parsed || typeof parsed !== "object") return null
        const parts = Object.entries(parsed as Record<string, unknown>).map(
            ([key, value]) => `${key}：${String(value)}`,
        )
        return parts.length > 0 ? parts.join("；") : null
    } catch {
        return null
    }
}

/** 店铺评价行卡：商品 + 星 + 正文/追评 + 回复区。hidden 行打灰但可见——商家要知道为什么少了条评价。 */
export function ReviewRow({
    item,
    busy,
    onReply,
}: {
    item: ReviewItem
    busy: boolean
    onReply: (item: ReviewItem) => void
}) {
    const t = useT()
    const spec = specLine(item.specValues)
    const hidden = item.status === "hidden"

    return (
        <div className={cn("rounded-lg border p-4", hidden && "bg-muted/40")}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {spec && <p className="mt-0.5 text-xs text-muted-foreground">{spec}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {hidden && <Badge variant="warning">{t("review.row.hidden")}</Badge>}
                    <span className="text-sm font-medium text-cta-alt">
                        {"★".repeat(item.overall ?? 0)}
                        <span className="text-muted-foreground/40">
                            {"★".repeat(5 - (item.overall ?? 0))}
                        </span>
                    </span>
                </div>
            </div>

            {item.content && <p className="mt-2 text-sm leading-relaxed">{item.content}</p>}
            {item.images.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {item.images.map((key) => (
                        <Image
                            key={key}
                            src={imgUrl(key)}
                            alt={item.title}
                            className="size-16 object-cover"
                        />
                    ))}
                </div>
            )}
            {item.content2 && (
                <div className="mt-2 rounded-md bg-muted/50 p-2.5">
                    <p className="text-xs font-medium text-muted-foreground">
                        {t("review.row.appendLabel")}
                    </p>
                    <p className="mt-1 text-sm">{item.content2}</p>
                </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                    {item.anonymous ? t("review.row.anonymous") : item.displayName}
                    {item.reviewedAt && (
                        <>
                            {" · "}
                            <TimeText iso={item.reviewedAt} />
                        </>
                    )}
                </span>
                {item.replyContent ? (
                    <span className="text-xs text-primary">{t("review.row.repliedLabel")}</span>
                ) : (
                    !hidden && (
                        <Button
                            size="xs"
                            variant="outline"
                            disabled={busy}
                            onClick={() => onReply(item)}
                        >
                            {t("review.row.replyAction")}
                        </Button>
                    )
                )}
            </div>
            {item.replyContent && (
                <div className="mt-2 rounded-md border-l-2 border-primary/40 bg-muted/40 p-2.5">
                    <p className="text-xs font-medium text-primary">{t("review.row.replyLabel")}</p>
                    <p className="mt-1 text-sm">{item.replyContent}</p>
                </div>
            )}
        </div>
    )
}
