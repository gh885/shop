package com.shop.telemetry.relay.ingest;

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
 * 部署事件：{@code POST /api/0/projects/{org}/{project}/releases/}。
 *
 * <p>路径照抄 Sentry，这样 {@code sentry-cli releases new/finalize} 能直接用。
 *
 * <p>为什么现在就收：**变更事件是将来根因分析唯一的时间锚**。数据库里的告警、trace、
 * 错误全都能按时间轴对齐，但没有"这一刻发布了什么"就没有归因的起点。收集成本一分钟，
 * 事后补要挖历史。所以它进 M0，不进后期。
 */
@RestController
@Profile({"relay", "all"})
public class ReleaseController {

    private final IngestQueue queue;

    public ReleaseController(IngestQueue queue) {
        this.queue = queue;
    }

    @PostMapping("/api/0/projects/{org}/{project}/releases/")
    public ResponseEntity<Map<String, Object>> create(
            @PathVariable String org,
            @PathVariable String project,
            @RequestHeader(value = "Content-Encoding", required = false) String contentEncoding,
            HttpServletRequest request) {
        byte[] body = RequestBodies.readBytes(request, contentEncoding);
        String payload = body.length == 0 ? "{}" : new String(body, StandardCharsets.UTF_8);
        queue.push(project, "release", payload);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("received", true, "project", project));
    }
}
