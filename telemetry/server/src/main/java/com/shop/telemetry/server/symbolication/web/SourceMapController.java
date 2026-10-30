package com.shop.telemetry.server.symbolication.web;

import com.shop.telemetry.server.symbolication.SourceMapV3;
import com.shop.telemetry.server.symbolication.internal.JdbcSourceMapRepository;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/**
 * sourcemap 上传：{@code PUT /api/{projectId}/sourcemaps/{debugId}?url=<bundle url>}。
 *
 * <p><b>为什么不是 sentry-cli 那个 artifact bundle 协议</b>：那是一整套东西（org token、
 * artifact bundle 的 zip + manifest、分片上传、release 关联），为 M0 复制它不划算。
 * 我们钉住更小的契约——**debug_id + 一份 .map**，而 debug_id 的注入本来就由
 * {@code @sentry/bundler-plugin} 负责，跟我们无关。等真要接 {@code sentry-cli} 时，
 * 那是一个新的 controller，不影响这张表和 {@link SourceMapV3}。
 *
 * <p>上传时就解析一遍：不合法的 map 立刻 400，不进库。脏数据在详情页炸出来最难查。
 */
@RestController
@Profile({"api", "all"})
class SourceMapController {

    private static final Pattern DEBUG_ID =
            Pattern.compile("^[0-9a-f]{32}$|^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$");

    private final JdbcSourceMapRepository repository;
    private final JsonMapper json;

    SourceMapController(JdbcSourceMapRepository repository, JsonMapper json) {
        this.repository = repository;
        this.json = json;
    }

    @PutMapping(path = "/api/{projectId}/sourcemaps/{debugId}", consumes = MediaType.ALL_VALUE)
    ResponseEntity<Map<String, Object>> upload(
            @PathVariable String projectId,
            @PathVariable String debugId,
            @RequestParam(name = "url", required = false) String bundleUrl,
            @RequestBody String body) {
        if (!DEBUG_ID.matcher(debugId).matches()) {
            return ResponseEntity.badRequest().body(Map.of("error", "debug_id 不是 uuid 形状"));
        }
        SourceMapV3 map;
        try {
            map = SourceMapV3.parse(json.readTree(body));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "source map 不合法：" + e.getMessage()));
        }
        repository.save(projectId, debugId, bundleUrl, body);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("debugId", debugId, "sources", map.sources().size()));
    }
}
