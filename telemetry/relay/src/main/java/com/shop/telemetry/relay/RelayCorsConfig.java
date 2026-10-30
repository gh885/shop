package com.shop.telemetry.relay;

import com.shop.telemetry.relay.projectconfig.ProjectConfig;
import com.shop.telemetry.relay.projectconfig.ProjectConfigSource;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * 浏览器上报的 CORS 必须按项目放行，不能 {@code *}。
 *
 * <p>路径就是配置键：{@code /api/{projectId}/envelope/} 的第一段决定允许哪些 Origin。
 * 后端上报不带 Origin，不受这里影响——**同一端点两种来源，靠请求头区分，不靠两个端点**。
 */
@Configuration
@Profile({"relay", "all"})
public class RelayCorsConfig {

    @Bean
    public CorsConfigurationSource telemetryCorsConfigurationSource(ProjectConfigSource configSource) {
        return request -> {
            String projectId = projectId(request.getRequestURI());
            if (projectId == null) {
                return null;
            }
            Optional<ProjectConfig> config = configSource.find(projectId);
            if (config.isEmpty() || config.get().allowedOrigins().isEmpty()) {
                return null;
            }
            CorsConfiguration cors = new CorsConfiguration();
            cors.setAllowedOrigins(List.copyOf(config.get().allowedOrigins()));
            cors.setAllowedMethods(List.of("POST", "OPTIONS"));
            cors.setAllowedHeaders(
                    List.of("Content-Type", "X-Sentry-Auth", "X-Sentry-Trace", "Baggage"));
            cors.setMaxAge(3600L);
            return cors;
        };
    }

    /** {@code /api/{projectId}/...} → projectId；不是项目级路径（如 /api/0/...）返回 null。 */
    private static String projectId(String uri) {
        if (uri == null) {
            return null;
        }
        String[] parts = uri.split("/");
        if (parts.length < 3 || !"api".equals(parts[1])) {
            return null;
        }
        String candidate = parts[2];
        return candidate.isBlank() || "0".equals(candidate) ? null : candidate;
    }
}
