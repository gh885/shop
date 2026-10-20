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

// body 只在 event 存在时挂载：BaseUI 关闭即卸载，每次打开重取一次，否则上一行的堆栈会残留成下一行的
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
        // 就地接错误，不靠路由级 errorComponent：那个边界会把整页连同列表一起换成错误页，人反而看不了下一条
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

    // 解析失败就原样显示 payload：那是唯一一份现场，格式化这一步不能把它吞掉
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
                {/* 客户端时间与接收时刻并排：两者不一致说明这台设备时钟有问题，去掉任一格这个信号就被抹平 */}
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
                {/* break-all 而非 break-words：堆栈与指纹有长不可断串，按词断会撑破抽屉 */}
                <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs break-all whitespace-pre-wrap">
                    {payload}
                </pre>
                <p className="text-xs text-muted-foreground">{t("rum.detail.payloadHint")}</p>
            </section>
        </div>
    )
}

// dd 上的 min-w-0 不能省：flex 子项默认 min-width:auto，去掉它长标识撑破抽屉、truncate 失效
function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex gap-4">
            <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0">{children}</dd>
        </div>
    )
}

function Mono({ children }: { children: ReactNode }) {
    return <span className="font-mono text-xs break-all">{children}</span>
}
