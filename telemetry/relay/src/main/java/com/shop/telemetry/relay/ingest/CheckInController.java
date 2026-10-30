package com.shop.telemetry.relay.ingest;

import com.shop.telemetry.relay.projectconfig.ProjectConfigSource;
import com.shop.telemetry.relay.queue.IngestQueue;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RestController;

/**
 * 定时任务心跳：{@code POST /api/{projectId}/cron/{slug}/{checkInId}/}。
 *
 * <p>这是"低关注度、高价值"的一类信号：任务没跑、跑挂、跑太久，错误和延迟都看不见它。
 * 前端用不上，但同一个入口、同一条告警通道，所以留在 relay 里。
 *
 * <p>不解析 body（{@code status}/{@code duration} 由 worker 按 schema 校验）。
 */
@RestController
@Profile({"relay", "all"})
public class CheckInController {

    private final ProjectConfigSource configSource;
    private final IngestQueue queue;

    public CheckInController(ProjectConfigSource configSource, IngestQueue queue) {
        this.configSource = configSource;
        this.queue = queue;
    }

    @PostMapping("/api/{projectId}/cron/{slug}/{checkInId}/")
    public ResponseEntity<Map<String, Object>> checkIn(
            @PathVariable String projectId,
            @PathVariable String slug,
            @PathVariable String checkInId,
            @RequestHeader(value = "Content-Encoding", required = false) String contentEncoding,
            HttpServletRequest request) {
        if (configSource.find(projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "unknown project"));
        }
        byte[] body = RequestBodies.readBytes(request, contentEncoding);
        String payload = body.length == 0 ? "{}" : new String(body, StandardCharsets.UTF_8);
        queue.push(projectId, "check_in", payload);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("check_in_id", checkInId, "slug", slug));
    }
}
