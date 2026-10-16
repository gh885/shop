import { useMemo, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import type { AdminRumEventDetail, AdminRumEventItem } from "@shop/api/sdk"
import { QueryBoundary } from "@shop/app-kit/data"
import { TimeText } from "@shop/app-kit/display"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    Skeleton,
} from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { APP_KEYS, KIND_KEYS } from "./constants"
import { rumEventDetailOptions } from "./queries"

/**
 * 单条事件的**原件**抽屉：堆栈、面包屑、设备。
 *
 * 这是排查链路的最后一级——列表只给摘要，摘要认不出「到底哪一行炸了」时才点进来。
 * 因此这里只做一件事：把整条事件不加修剪地摆出来。
 *
 * **body 只在打开时挂载**（BaseUI 的 Dialog 关闭即卸载）：每次打开都是新取一次，
 * 上一行的堆栈不会残留在下一行上——那是排查里最容易得出错误结论的一种假象。
 */
export function RumEventDetailSheet({
    event,
    onClose,
}: {
    event: AdminRumEventItem | undefined
    onClose: () => void
}) {
    const t = useT()
    return (
        <Sheet
            open={event !== undefined}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <SheetContent
                side="right"
                className="w-full sm:max-w-2xl"
            >
                <SheetHeader>
                    <SheetTitle>{t("rum.detail.title")}</SheetTitle>
                    {/* 描述给一句固定的说明、不放那条 message：message 最长 500 字，
                        塞进抽屉头会把正文顶下去，而它本来就在下面的字段里列着 */}
                    <SheetDescription>{t("rum.detail.description")}</SheetDescription>
                </SheetHeader>
                {event ? <RumEventDetailBody id={event.id} /> : undefined}
            </SheetContent>
        </Sheet>
    )
}

function RumEventDetailBody({ id }: { id: string }) {
    const t = useT()
    const query = useQuery(rumEventDetailOptions(id))

    return (
        // 抽屉里没有路由级 errorComponent 能接——那个边界在上面，接住会把整页连同列表一起换成错误页。
        // 所以就地给它一个：取不到就让错误态留在抽屉里，身后的列表还在，人还能看下一条。
        <QueryBoundary fallback={t("rum.detail.loadFailed")}>
            {query.isPending ? (
                <Skeleton className="h-64 w-full" />
            ) : query.data ? (
                <RumEventDetailFields detail={query.data} />
            ) : undefined}
        </QueryBoundary>
    )
}

function RumEventDetailFields({ detail }: { detail: AdminRumEventDetail }) {
    const t = useT()

    /**
     * 原件是后端原样存下来的那一串（已脱敏），这里只为**好读**格式化一次。
     *
     * 解析失败就原样显示：宁可难看，也不能因为格式化这一步把唯一的那份现场吞掉。
     */
    const payload = useMemo(() => {
        try {
            return JSON.stringify(JSON.parse(detail.payload), null, 2)
        } catch {
            return detail.payload
        }
    }, [detail.payload])

    const appKey = APP_KEYS[detail.app]
    const kindKey = KIND_KEYS[detail.kind]

    return (
        <div className="space-y-6 px-4 pb-4">
            <dl className="space-y-2 text-sm">
                <Row label={t("rum.field.time")}>
                    <TimeText iso={detail.createdAt} />
                </Row>
                {/* 客户端时间单独列出来：它和上一条不一样时，说明这台设备的时钟有问题，
                    而它已经被后端兜成了接收时刻——不并排放，这个信号就被抹平了 */}
                <Row label={t("rum.field.clientTime")}>
                    <TimeText iso={detail.ts} />
                </Row>
                <Row label={t("rum.field.app")}>{appKey ? t(appKey) : detail.app}</Row>
                <Row label={t("rum.field.kind")}>{kindKey ? t(kindKey) : detail.kind}</Row>
                <Row label={t("rum.field.name")}>{detail.name ?? "—"}</Row>
                <Row label={t("rum.field.version")}>
                    <Mono>{detail.version ?? "—"}</Mono>
                </Row>
                <Row label={t("rum.field.env")}>{detail.env ?? "—"}</Row>
                <Row label={t("rum.field.route")}>
                    <Mono>{detail.route ?? "—"}</Mono>
                </Row>
                <Row label={t("rum.field.session")}>
                    <Mono>{detail.sessionId ?? "—"}</Mono>
                </Row>
                <Row label={t("rum.field.user")}>
                    <Mono>{detail.userId ?? "—"}</Mono>
                </Row>
                <Row label={t("rum.field.fingerprint")}>
                    <Mono>{detail.fingerprint ?? "—"}</Mono>
                </Row>
                <Row label={t("rum.field.message")}>{detail.message ?? "—"}</Row>
            </dl>

            <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("rum.detail.payload")}</h3>
                {/* break-all 而不是 break-words：堆栈与指纹里有长不可断串，按词断会撑破抽屉 */}
                <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs break-all whitespace-pre-wrap">
                    {payload}
                </pre>
                <p className="text-xs text-muted-foreground">{t("rum.detail.payloadHint")}</p>
            </section>
        </div>
    )
}

/** 一行字段：标签固定宽度、值占满剩下的（`min-w-0` 是让长标识真的能截断，而不是把抽屉撑破） */
function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex gap-4">
            <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0">{children}</dd>
        </div>
    )
}

/** 标识类字段：等宽才好一个字符一个字符地对，非等宽字体下 `l`/`1`/`I` 分不出来 */
function Mono({ children }: { children: ReactNode }) {
    return <span className="font-mono text-xs break-all">{children}</span>
}
