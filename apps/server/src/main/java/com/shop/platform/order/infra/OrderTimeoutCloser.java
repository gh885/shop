package com.shop.platform.order.infra;

import com.shop.platform.order.service.OrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 超时关单任务：扫 idx_orders_pay_expire 部分索引（全集即过期待付款单），逐笔关闭并回补库存。
 * 调度线程池与 MDC 见 infra/observability/SchedulingConfig；批内每笔条件更新，与支付/手动取消竞态时让位。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class OrderTimeoutCloser {

    /** 扫描间隔 30s：待付款窗口 15 分钟，分钟级业务对秒级延迟不敏感 */
    private static final long SCAN_INTERVAL_MS = 30_000;

    private final OrderService orderService;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void closeExpiredOrders() {
        int closed = orderService.closeExpired();
        if (closed > 0) {
            log.info("[ORDER] 超时关单 {} 笔", closed);
        }
    }
}
