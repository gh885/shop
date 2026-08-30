package com.shop.platform.order.infra;

import com.shop.platform.order.service.OrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 超时关单任务：扫 idx_orders_pay_expire 部分索引（全集即过期待付款单），逐笔关闭并回补库存。
 * 调度线程池与 MDC 见 infra/observability/SchedulingConfig；批内每笔条件更新，与支付/手动取消竞态时让位。
 *
 * <p><b>为何不加分布式锁</b>：多实例部署时本任务会在每个实例各自起扫，但关单的唯一写入口是
 * {@code OrderCloseService.closeOne} 的条件更新（{@code WHERE status = 'PENDING_PAYMENT'} + 影响行数判定），
 * 同一笔订单只有一个实例能抢到，余者 affected = 0 直接让位——<b>正确性不依赖锁</b>，多扫的代价仅是
 * 重复的 SELECT（部分索引命中、批上限 100 行）。等空扫真影响库负载时再上锁，且优先
 * {@code pg_try_advisory_xact_lock}（事务结束自动释放、实例崩溃无残留锁），不自建锁表背 TTL 兼顾。
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
