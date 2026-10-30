import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { api, projectId, type EventDetail, type IssueSummary, type SymbolicatedStack } from "./api"
import { TracePanel } from "./TracePanel"

/**
 * 三个视图：issue 列表、选中 issue 的事件详情、一条 trace 的调用链。
 *
 * 仍然不引路由：三个视图是"同一个页面的三段展开"，展开状态就是两个 id。
 * 引路由器要处理 URL 编码、返回键、深链接三件事，而这三件事现在没有任何人需要——
 * 等出现"要把某个 issue 的链接发给同事"这个需求时再引，那时它才有理由存在。
 */
export function App() {
    const issues = useQuery({ queryKey: ["issues", projectId], queryFn: api.issues })
    const [selected, setSelected] = useState<number | null>(null)
    const [traceId, setTraceId] = useState<string | null>(null)
    const events = useQuery({
        queryKey: ["events", projectId, selected],
        queryFn: () => api.events(selected ?? 0),
        enabled: selected !== null,
    })

    return (
        <main className="mx-auto max-w-5xl px-6 py-10 text-ink">
            <header className="flex items-baseline justify-between border-b border-line pb-4">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">telemetry</h1>
                    <p className="mt-1 text-xs text-muted">project {projectId}</p>
                </div>
                <span className="font-mono text-xs text-muted">
                    {issues.data ? `${issues.data.length} issues` : "—"}
                </span>
            </header>

            {issues.isPending ? <p className="mt-10 text-sm text-muted">加载中…</p> : null}

            {issues.isError ? (
                <p className="mt-10 text-sm text-accent">
                    取不到 issue 列表：{issues.error.message}
                    <br />
                    <span className="text-muted">
                        先确认 relay / worker 在跑、库里有过事件（见 telemetry/README.md「链路」）。
                    </span>
                </p>
            ) : null}

            {issues.data && issues.data.length === 0 ? (
                <p className="mt-10 text-sm text-muted">
                    还没有 issue。README 末尾的「未验证」那段有一份能一键跑通的 demo（含
                    sourcemap）。
                </p>
            ) : null}

            <ul className="mt-6 divide-y divide-line">
                {issues.data?.map((issue) => (
                    <IssueRow
                        key={issue.id}
                        issue={issue}
                        active={selected === issue.id}
                        onSelect={() => setSelected(issue.id)}
                    />
                ))}
            </ul>

            {selected !== null ? (
                <section className="mt-8">
                    <h2 className="text-sm font-medium">最近事件</h2>
                    {events.isPending ? <p className="mt-3 text-sm text-muted">加载中…</p> : null}
                    {events.data?.map((event) => (
                        <EventCard
                            key={event.id}
                            event={event}
                            onOpenTrace={setTraceId}
                        />
                    ))}
                </section>
            ) : null}

            {traceId !== null ? (
                <TracePanel
                    traceId={traceId}
                    onClose={() => setTraceId(null)}
                />
            ) : null}
        </main>
    )
}

function IssueRow(props: { issue: IssueSummary; active: boolean; onSelect: () => void }) {
    const { issue, active, onSelect } = props
    return (
        <li>
            <button
                type="button"
                onClick={onSelect}
                className={`flex w-full items-baseline gap-4 py-3 text-left hover:bg-surface ${
                    active ? "bg-surface" : ""
                }`}
            >
                <span className="font-mono text-xs text-muted">#{issue.id}</span>
                <span className="flex-1 truncate text-sm">{issue.title}</span>
                <span className="font-mono text-xs text-muted">{issue.culprit ?? "—"}</span>
                <span className="font-mono text-xs">{issue.eventCount}</span>
            </button>
        </li>
    )
}

function EventCard(props: { event: EventDetail; onOpenTrace: (traceId: string) => void }) {
    const { event, onOpenTrace } = props
    return (
        <article className="mt-4 border border-line p-4">
            <p className="flex flex-wrap items-baseline gap-x-3 font-mono text-xs text-muted">
                <span>{event.eventId}</span>
                <span>{event.release ?? "no release"}</span>
                <span>{event.transaction ?? "no transaction"}</span>
                {/* trace_id 是跨端唯一的抓手：能点进去，才知道这次错误前后调用了哪个服务 */}
                {event.traceId ? (
                    <button
                        type="button"
                        onClick={() => onOpenTrace(event.traceId as string)}
                        className="border border-line px-1.5 hover:text-ink"
                    >
                        trace {event.traceId.slice(0, 8)}
                    </button>
                ) : (
                    <span>no trace</span>
                )}
            </p>
            <Stack stack={event.stack} />
            <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted">原始 payload</summary>
                <pre className="mt-2 max-h-96 overflow-auto bg-surface p-3 text-xs whitespace-pre-wrap">
                    {JSON.stringify(event.payload, null, 2)}
                </pre>
            </details>
        </article>
    )
}

function Stack({ stack }: { stack: SymbolicatedStack }) {
    if (stack.status === "NO_FRAMES") {
        return <p className="mt-3 text-xs text-muted">这条事件没有栈帧。</p>
    }
    const hint = statusHint(stack.status)
    return (
        <div className="mt-3">
            {hint ? <p className="text-xs text-accent">{hint}</p> : null}
            <ol className="mt-2 space-y-1 font-mono text-xs">
                {stack.frames.map((frame, index) => (
                    <li
                        key={`${frame.source}:${frame.line}:${frame.column}:${index}`}
                        className={frame.inApp ? "" : "text-muted"}
                    >
                        <span className="text-muted">{frame.function ?? "<anonymous>"}</span>{" "}
                        {frame.source}:{frame.line}:{frame.column}
                    </li>
                ))}
            </ol>
        </div>
    )
}

/** 把"为什么堆栈是压缩态"直接说在界面上：平台最常缺的就是这个答案。 */
function statusHint(status: SymbolicatedStack["status"]): string | null {
    switch (status) {
        case "NO_DEBUG_ID":
            return "事件里没有 debug_id：SDK 没开 sourcemap 注入，位置只能是压缩后的。"
        case "NO_SOURCEMAP":
            return "有 debug_id，但库里没有对应的 sourcemap：产物没上传（node telemetry/scripts/upload-sourcemaps.mjs <dist>）。"
        default:
            return null
    }
}
