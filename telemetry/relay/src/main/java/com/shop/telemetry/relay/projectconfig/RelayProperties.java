package com.shop.telemetry.relay.projectconfig;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * M0 的本地项目配置。M2 后这份只留作 dev 夹具，真值来自控制面。
 */
@ConfigurationProperties(prefix = "telemetry.relay")
public record RelayProperties(List<Project> projects) {

    public record Project(
            String id, String publicKey, List<String> allowedOrigins, Double tracesSampleRate) {}
}
