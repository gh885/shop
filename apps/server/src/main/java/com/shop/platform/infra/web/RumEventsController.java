package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 前端遥测接收端：`POST /api/rum/events`（frontend-monitoring.md 的「接收端选型」里那条
 * 「后端加接收接口」，契约第 3 条「上报发往自己域名下的固定路径」定的就是它）。
 *
 * <p>选后端接口而不是 Sentry/GlitchTip 的理由在那份文档里已经写过：前端事件与后端事件进同一个
 * 检索、按 `trace_id` 直接关联，告警复用已有的 Prometheus + Alertmanager。代价（sourcemap 还原、
 * 指纹聚合）本轮**不做**——那是「接收端按影响用户数排序」那条，等真有排查需求再长。
 *
 * <p>三件事刻意如此：
 *
 * <ul>
 *   <li><b>收 `text/plain`。</b>发送端用 `sendBeacon` 且刻意避开 CORS 预检，body 的
 *       Content-Type 就是 `text/plain`（`transport.ts` 文件头第 1 条）。这里跟着写死，
 *       写 `application/json` 会让全部上报 415。
 *   <li><b>永远回 204。</b>遥测没有「重试」这个概念：发送端 `sendBeacon` / `fetch(...).catch(() => {})`
 *       都不看响应。回 429 或 4xx 除了在代理日志里制造噪声之外没有作用，所以限流、脏数据、
 *       超出批量……全部仍是 204，只在指标与日志里留痕。
 *   <li><b>控制器只调一次 use-case</b>（apps/AGENTS.md「Controller 编排」）。解析、校验、计数、
 *       限流都在 {@link RumEventIngest}。
 * </ul>
 */
@RestController
@RequestMapping("/api/rum")
@RequiredArgsConstructor
public class RumEventsController {

    private final RumEventIngest ingest;
    private final ClientIp clientIp;

    @PostMapping(value = "/events", consumes = MediaType.TEXT_PLAIN_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void events(@RequestBody String body, HttpServletRequest request) {
        ingest.ingest(body, clientIp.of(request));
    }
}
