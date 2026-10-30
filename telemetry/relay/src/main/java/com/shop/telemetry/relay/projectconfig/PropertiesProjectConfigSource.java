package com.shop.telemetry.relay.projectconfig;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * M0 的配置源：读 {@code telemetry.relay.projects[*]}，本地缓存 30s。
 *
 * <p>它长得像个缓存而不是一个查询，是故意的——M2 换实现时上层（鉴权、CORS、采样）
 * 一行都不用改。
 */
@Component
public class PropertiesProjectConfigSource implements ProjectConfigSource {

    private static final Duration TTL = Duration.ofSeconds(30);

    private final Map<String, ProjectConfig> configured = new ConcurrentHashMap<>();
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public PropertiesProjectConfigSource(RelayProperties properties) {
        List<RelayProperties.Project> projects = properties.projects() == null ? List.of() : properties.projects();
        for (RelayProperties.Project project : projects) {
            if (project.id() == null || project.id().isBlank()) {
                continue;
            }
            configured.put(
                    project.id(),
                    new ProjectConfig(
                            project.id(),
                            project.publicKey() == null ? "" : project.publicKey(),
                            project.allowedOrigins() == null
                                    ? Set.of()
                                    : Set.copyOf(project.allowedOrigins()),
                            project.tracesSampleRate() == null ? 0.1d : project.tracesSampleRate(),
                            true,
                            1L));
        }
    }

    @Override
    public Optional<ProjectConfig> find(String projectId) {
        if (projectId == null || projectId.isBlank()) {
            return Optional.empty();
        }
        Cached hit = cache.get(projectId);
        if (hit != null && hit.expiresAt().isAfter(Instant.now())) {
            return Optional.ofNullable(hit.config());
        }
        ProjectConfig config = configured.get(projectId);
        if (config == null) {
            return Optional.empty();
        }
        cache.put(projectId, new Cached(config, Instant.now().plus(TTL)));
        return Optional.of(config);
    }

    private record Cached(ProjectConfig config, Instant expiresAt) {}
}
