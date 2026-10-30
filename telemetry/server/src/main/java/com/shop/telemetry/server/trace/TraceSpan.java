package com.shop.telemetry.server.trace;

/**
 * 一个节点（span 或错误标记）。
 *
 * <p>三种 {@code kind}，界面上用不同的图标/颜色区分，但**在树里是同一等公民**：
 *
 * <ul>
 *   <li>{@code transaction} 一次端请求的根（浏览器的一次 pageload、后端的一次 http.server）
 *   <li>{@code span} 事务内部的子步骤（db.query / http.client / ui.render…）
 *   <li>{@code error} 落在某个 span 下的错误事件。它不是 span（没有耗时），
 *       但**挂在正确的父节点下才是 trace 视图的全部价值**："错在取数的那个 db.query 上"
 * </ul>
 *
 * @param startedAtMs 相对 {@link TraceGraph#startedAt} 的毫秒偏移。界面上直接用它画时间条，
 *     避免前端再做一遍时钟换算（两端时钟本来就有偏差）
 * @param durationMs 错误标记为 0
 * @param eventId 点回事件详情用；error 节点必有
 */
public record TraceSpan(
        String spanId,
        String parentSpanId,
        int depth,
        String kind,
        String op,
        String description,
        String service,
        String transaction,
        String status,
        long startedAtMs,
        long durationMs,
        String level,
        Long eventId) {}
