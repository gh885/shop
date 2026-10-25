package com.shop.platform.infra.event;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 事件补发的参数。默认值按「一条事件最多被重投 10 次、每次至少隔 1 分钟」定——够修好一次下游故障，
 * 又不至于把一个永远失败的监听器打成风扇。
 *
 * @param enabled 开关。测试默认关，免得后台任务污染别人
 * @param interval 两次扫描的间隔
 * @param minAge 只捡「发布了这么久还没完成」的。太新的可能正在跑，抢过来会重复消费
 * @param maxInFlight 单轮最多重投多少条
 * @param maxAttempts 超过这个重投次数就不再自动重试，留给人工
 * @param stuckAfter 超过这么久还没完成就打 WARN。这是唯一值得盯的数字
 */
@ConfigurationProperties("shop.event.retry")
public record EventRetryProperties(
        boolean enabled, Duration interval, Duration minAge, int maxInFlight, int maxAttempts, Duration stuckAfter) {

    public EventRetryProperties {
        interval = interval == null ? Duration.ofSeconds(30) : interval;
        minAge = minAge == null ? Duration.ofMinutes(1) : minAge;
        maxInFlight = maxInFlight <= 0 ? 10 : maxInFlight;
        maxAttempts = maxAttempts < 0 ? 0 : maxAttempts;
        stuckAfter = stuckAfter == null ? Duration.ofMinutes(5) : stuckAfter;
    }
}
