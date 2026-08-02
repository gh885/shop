package com.shop.platform.controller;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    private final DataSource dataSource;

    private final RedisConnectionFactory redisFactory;

    public HealthController(DataSource dataSource, RedisConnectionFactory redisFactory) {
        this.dataSource = dataSource;
        this.redisFactory = redisFactory;
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> health() {
        var checks = new LinkedHashMap<String, String>();
        checks.put("database", checkDatabase());
        checks.put("redis", checkRedis());

        var status = checks.values().stream().anyMatch(v -> v.equals("DOWN")) ? "DEGRADED" : "UP";

        return ResponseEntity.ok(Map.of(
                "status", status,
                "checks", checks,
                "timestamp", Instant.now().toString()));
    }

    private String checkDatabase() {
        try (var conn = dataSource.getConnection()) {
            return conn.isValid(2) ? "UP" : "DOWN";
        } catch (Exception e) {
            return "DOWN";
        }
    }

    private String checkRedis() {
        if (redisFactory == null) {
            return "NOT_CONFIGURED";
        }
        try (var conn = redisFactory.getConnection()) {
            conn.ping();
            return "UP";
        } catch (Exception e) {
            return "DOWN";
        }
    }
}
