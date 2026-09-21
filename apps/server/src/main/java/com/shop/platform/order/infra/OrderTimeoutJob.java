package com.shop.platform.order.infra;

import com.shop.platform.order.service.OrderTimeout;
import com.shop.platform.order.service.OrderTimeoutService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 超时任务调度：定时把 {@link OrderTimeout} 的每条规则交给 {@link OrderTimeoutService} 扫一遍。
 * 本类只管「多久扫一次、扫完记什么日志」，超时契约与并发让位机制都在 service 侧。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class OrderTimeoutJob {

    /** 扫描间隔 30s：待付款窗口 15 分钟、发货/收货窗口天级，分钟级业务对秒级延迟不敏感 */
    private static final long SCAN_INTERVAL_MS = 30_000;

    private final OrderTimeoutService orderTimeoutService;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void sweepTimeouts() {
        for (OrderTimeout rule : OrderTimeout.values()) {
            int handled = orderTimeoutService.sweep(rule);
            if (handled > 0) {
                log.info("[ORDER] {} {} 笔", rule.description(), handled);
            }
        }
    }
}
