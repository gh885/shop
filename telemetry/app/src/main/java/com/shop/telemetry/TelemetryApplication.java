package com.shop.telemetry;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * 唯一的装配点：一个 artifact，靠 profile 决定起哪些部分。
 *
 * <p>照抄 {@code sentry run web / consumer / cron} 那个模式——职责不同的代码不分仓，
 * 伸缩特性不同的才分进程。所以这里的 profile 不是"环境"（dev/prod），而是**角色**：
 *
 * <ul>
 *   <li>{@code relay} 公网入口
 *   <li>{@code api} 查询接口 + 平台前端
 *   <li>{@code worker} 队列消费者
 *   <li>{@code cron} 定时评估（告警、回归检测、SLO）
 *   <li>{@code all} 以上全开，本地开发用
 * </ul>
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class TelemetryApplication {

    public static void main(String[] args) {
        SpringApplication.run(TelemetryApplication.class, args);
    }
}
