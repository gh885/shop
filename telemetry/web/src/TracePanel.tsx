import { useQuery } from "@tanstack/react-query"

import { api, projectId, type TraceGraph, type TraceSpan } from "./api"

/**
 * 一条 trace 的完整调用链。
 *
 * 为什么是"拍平 + 缩进"而不是嵌套组件：树深由客户端决定，递归渲染遇到畸形数据
 * （父子互指）会直接白屏；服务端已经做过环保护并给出 depth，这里只负责画。
 *
 * 时间条是这一页的全部意义所在：错误发生在"哪一段慢调用里"、跨端之间隔了多久，
 * 只有横向对齐之后才能一眼看出来，靠读毫秒数字是看不出来的。
 */
export function TracePanel(props: { traceId: string; onClose: () => void }) {
    const trace = useQuery({
        queryKey: ["trace", projectId, props.traceId],
        queryFn: () => api.trace(props.traceId),
    })

    return (
        <section className="mt-8">
            <div className="flex items-baseline justify-between border-b border-line pb-3">
                <div>
                    <h2 className="text-sm font-medium">trace</h2>
                    <p className="mt-1 font-mono text-xs break-all text-muted">{props.traceId}</p>
                </div>
                <button
                    type="button"
                    onClick={props.onClose}
                    className="font-mono text-xs text-muted hover:text-ink"
                >
                    ← 收起
                </button>
            </div>

            {trace.isPending ? <p className="mt-6 text-sm text-muted">加载中…</p> : null}

            {trace.isError ? (
                <p className="mt-6 text-sm text-accent">
                    取不到这条 trace：{trace.error.message}
                    <br />
                    <span className="text-muted">
                        形状对但没数据，通常是采样没抽中、超出 30 天窗口，或者上游没透传 trace 头。
                    </span>
                </p>
            ) : null}

            {trace.data ? <TraceBody graph={trace.data} /> : null}
        </section>
    )
}

function TraceBody({ graph }: { graph: TraceGraph }) {
    // 最长的节点决定时间条的比例基准；全为 0 时避免除零
    const scale = Math.max(graph.durationMs, 1)
    return (
        <>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-xs text-muted">
                <span>{formatDuration(graph.durationMs)}</span>
                <span>
                    {graph.services.length} 服务 · {graph.spans.length} 节点
                </span>
                {graph.errorCount > 0 ? (
                    <span className="text-accent">{graph.errorCount} 个错误</span>
                ) : null}
                <span className="ml-auto">
                    {graph.services.map((service) => (
                        <span
                            key={service}
                            className="ml-2 border border-line px-1.5"
                        >
                            {service}
                        </span>
                    ))}
                </span>
            </p>

            <div className="mt-4 font-mono text-xs">
                <div className="flex items-center gap-3 border-b border-line pb-1 text-muted">
                    <span className="w-[1px] shrink-0" />
                    <span className="flex-1">span</span>
                    <span className="w-14 shrink-0 text-right">耗时</span>
                    <span className="w-40 shrink-0">时间轴</span>
                </div>
                <ol>
                    {graph.spans.map((span) => (
                        <SpanRow
                            key={span.spanId}
                            span={span}
                            scale={scale}
                        />
                    ))}
                </ol>
            </div>
        </>
    )
}

function SpanRow({ span, scale }: { span: TraceSpan; scale: number }) {
    const isError = span.kind === "error"
    const offset = Math.min(100, (span.startedAtMs / scale) * 100)
    const width = Math.min(100 - offset, (span.durationMs / scale) * 100)
    return (
        <li className={`flex items-center gap-3 py-0.5 ${isError ? "text-accent" : ""}`}>
            <span
                className="shrink-0"
                style={{ width: `${span.depth * 14}px` }}
            />
            <span className="shrink-0 text-muted">{isError ? "✕" : "·"}</span>
            <span
                className="min-w-0 flex-1 truncate"
                title={span.description}
            >
                <span className={isError ? "" : "text-muted"}>{span.op ?? span.kind}</span>{" "}
                {span.description}
                {span.transaction && span.kind !== "error" ? (
                    <span className="text-muted"> · {span.transaction}</span>
                ) : null}
            </span>
            <span className="w-14 shrink-0 text-right">{formatDuration(span.durationMs)}</span>
            <span className="relative w-40 shrink-0 self-center border-l border-line">
                {isError ? (
                    <span
                        className="absolute -top-1 text-accent"
                        style={{ left: `${offset}%` }}
                    >
                        ✕
                    </span>
                ) : (
                    <span
                        className="absolute top-1/2 h-2 -translate-y-1/2 bg-ink/25"
                        style={{ left: `${offset}%`, width: `${Math.max(width, 0.6)}%` }}
                    />
                )}
            </span>
        </li>
    )
}

/** 一眼可读的耗时：这条链上从几十微秒到几秒都有。 */
function formatDuration(ms: number): string {
    if (ms <= 0) {
        return "—"
    }
    if (ms < 1000) {
        return `${ms}ms`
    }
    if (ms < 60_000) {
        return `${(ms / 1000).toFixed(2)}s`
    }
    return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}
