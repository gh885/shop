package com.shop.telemetry.server.trace.web;

import com.shop.telemetry.server.trace.TraceService;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/{projectId}/traces/{traceId}}：一条完整调用链。
 *
 * <p>错误语义刻意区分两种"没有"：
 *
 * <ul>
 *   <li>trace_id 形状不对 → 400。这是调用方的 bug（比如把 issue id 当 trace id 传了）
 *   <li>形状对但没有数据 → 404。可能是采样没抽中、窗口外、或上游没透传 trace 头
 * </ul>
 *
 * 合并成 404 会让"我的 SDK 没传头"和"我查错了 id"看起来一样。
 */
@RestController
@Profile({"api", "all"})
class TraceController {

    private final TraceService traces;

    TraceController(TraceService traces) {
        this.traces = traces;
    }

    @GetMapping("/api/{projectId}/traces/{traceId}")
    ResponseEntity<Object> find(@PathVariable String projectId, @PathVariable String traceId) {
        if (!traceId.matches("^[0-9a-f]{32}$")) {
            return ResponseEntity.badRequest().body(Map.of("error", "trace_id 必须是 32 位小写十六进制"));
        }
        return traces.find(projectId, traceId)
                .<ResponseEntity<Object>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "trace not found")));
    }
}
