package com.shop.telemetry.server.trace;

import java.time.Instant;
import java.util.List;

/**
 * 一条 trace 的**读**形状：已经拍平成 DFS 先序 + 深度。
 *
 * <p>为什么不用嵌套结构：JSON 里嵌套三层以上，前端渲染要递归、调试要展开、
 * 而且"某个 span 的子树太大"在 JSON 里是不可观测的。拍平 + {@code depth} 让前端渲染只是一个
 * {@code map}，缩进由 {@code depth} 决定——同时保留一个天然的好处：**顺序就是视觉顺序**，
 * 眼睛看到的行号差等于树的层数差。
 *
 * @param traceId 客户端生成的 32 位十六进制；跨端连接的唯一钩子
 * @param startedAt 最早一个 span 的起点（不是落库时间，也不是根 span 的起点）
 * @param durationMs 整条 trace 的跨度：最后一个 span 结束 − 最早一个 span 开始
 * @param services 涉及的服务，按首次出现排序（"这条请求打到了哪几个服务"一眼可见）
 * @param errorCount 链上的错误事件数；{@code > 0} 说明这次跨端调用出事了
 */
public record TraceGraph(
        String traceId,
        Instant startedAt,
        long durationMs,
        List<String> services,
        int errorCount,
        List<TraceSpan> spans) {}
