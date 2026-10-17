package com.shop.platform.order.infra;

import com.shop.platform.order.service.OrderTimeout;
import com.shop.platform.order.service.OrderTimeoutService;
import com.shop.platform.order.service.TradeTimeoutService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 超时任务调度：支付超时扫主订单，收货超时扫子订单。
 * 本类只管「多久扫一次、扫完记什么日志」，超时契约与并发让位机制都在 service 侧。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class OrderTimeoutJob {

    /** 扫描间隔 30s：待支付窗口 15 分钟、收货窗口天级，分钟级业务对秒级延迟不敏感 */
    private static final long SCAN_INTERVAL_MS = 30_000;

    private final OrderTimeoutService orderTimeoutService;

    private final TradeTimeoutService tradeTimeoutService;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void sweepTimeouts() {
        int closedTrades = tradeTimeoutService.sweep();
        if (closedTrades > 0) {
            log.info("[TRADE] 超时未支付关单 {} 笔", closedTrades);
        }
        for (OrderTimeout rule : OrderTimeout.values()) {
            int handled = orderTimeoutService.sweep(rule);
            if (handled > 0) {
                log.info("[ORDER] {} {} 笔", rule.description(), handled);
            }
        }
    }
}
