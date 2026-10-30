package com.shop.telemetry.relay.ingest;

import com.shop.telemetry.proto.Envelope;
import com.shop.telemetry.proto.EnvelopeItem;
import com.shop.telemetry.proto.EnvelopeReader;
import com.shop.telemetry.relay.auth.DsnAuth;
import com.shop.telemetry.relay.projectconfig.ProjectConfig;
import com.shop.telemetry.relay.projectconfig.ProjectConfigSource;
import com.shop.telemetry.relay.queue.IngestQueue;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;

/**
 * 公网唯一写入点：{@code POST /api/{projectId}/envelope/}。
 *
 * <p>它只做四件事，且顺序不能换：**鉴权 → 拆包 → （M2 在此插入脱敏/限流/采样） → 入队**。
 * 不解析 event 字段、不碰数据库、不做分组——那些是 worker 的事。这条界线一旦破，
 * relay 就会被业务逻辑撑大，然后无法独立伸缩。
 *
 * <p>响应码的意义（SDK 会据此决定重试与否）：
 *
 * <ul>
 *   <li>200 已入队（不代表已入库）
 *   <li>400 结构不合法，重试也没用
 *   <li>401/404 key 或项目不对
 *   <li>413 请求体超过上限（解压炸弹）；SDK 不会重试
 *   <li>429 超配额，配合 {@code X-Sentry-Rate-Limits} 让 SDK 自己退避（M2）
 * </ul>
 */
@RestController
@Profile({"relay", "all"})
public class EnvelopeController {

    private final ProjectConfigSource configSource;
    private final IngestQueue queue;

    public EnvelopeController(ProjectConfigSource configSource, IngestQueue queue) {
        this.configSource = configSource;
        this.queue = queue;
    }

    @PostMapping("/api/{projectId}/envelope/")
    public ResponseEntity<Map<String, Object>> ingest(
            @PathVariable String projectId,
            @RequestHeader(value = "X-Sentry-Auth", required = false) String authHeader,
            @RequestHeader(value = "Content-Encoding", required = false) String contentEncoding,
            @RequestParam(value = "sentry_key", required = false) String sentryKey,
            HttpServletRequest request) {

        Optional<ProjectConfig> found = configSource.find(projectId);
        if (found.isEmpty() || !found.get().enabled()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "unknown project"));
        }
        ProjectConfig project = found.get();
        Optional<String> key = DsnAuth.publicKey(authHeader, sentryKey);
        if (key.isEmpty() || !project.publicKey().equals(key.get())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "invalid key"));
        }

        Envelope envelope;
        try {
            envelope = EnvelopeReader.read(RequestBodies.readBytes(request, contentEncoding));
        } catch (RequestBodies.TooLarge e) {
            return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }

        for (EnvelopeItem item : envelope.items()) {
            queue.push(project.projectId(), item.type(), item.payload());
        }
        return ResponseEntity.ok(Map.of("items", envelope.items().size()));
    }
}
