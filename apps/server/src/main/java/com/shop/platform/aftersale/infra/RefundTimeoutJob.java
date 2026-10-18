package com.shop.platform.aftersale.infra;

import com.shop.platform.aftersale.service.RefundTimeoutService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 退款超时任务调度（AFS-23）：定时把三条超时线（卖家审核 / 买家回寄 / 卖家确认收货）交给
 * {@link RefundTimeoutService} 扫一遍。
 *
 * <p>本类只管「多久扫一次、扫完记什么日志」，窗口常量在 model、并发让位在 service。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class RefundTimeoutJob {

    /** 扫描间隔 30s：与订单侧 OrderTimeoutJob 同值——售后窗口是 48h/7d/10d 量级，分钟级延迟都无感，扫快只费库 */
    private static final long SCAN_INTERVAL_MS = 30_000;

    private final RefundTimeoutService refundTimeoutService;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void sweepTimeouts() {
        int agreed = refundTimeoutService.sweepSellerResponse();
        if (agreed > 0) {
            log.info("[REFUND] 卖家超时未处理自动同意 {} 笔", agreed);
        }
        int closed = refundTimeoutService.sweepReturnShip();
        if (closed > 0) {
            log.info("[REFUND] 买家超时未回寄自动关闭 {} 笔", closed);
        }
        int received = refundTimeoutService.sweepReturnReceive();
        if (received > 0) {
            log.info("[REFUND] 卖家超时未确认收货自动退款 {} 笔", received);
        }
    }
}
