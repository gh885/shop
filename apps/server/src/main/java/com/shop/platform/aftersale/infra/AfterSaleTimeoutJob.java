package com.shop.platform.aftersale.infra;

import com.shop.platform.aftersale.service.AfterSaleTimeoutService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 售后超时任务调度（C11）：定时把两条超时线（卖家审核 / 买家回寄）交给 {@link AfterSaleTimeoutService} 扫一遍。
 * 本类只管「多久扫一次、扫完记什么日志」，窗口常量与并发让位机制都在 service / model 侧。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class AfterSaleTimeoutJob {

    /** 扫描间隔 30s：与订单侧 OrderTimeoutJob 同值——售后窗口是 48h/7d 量级，分钟级延迟都无感，扫快只费库 */
    private static final long SCAN_INTERVAL_MS = 30_000;

    private final AfterSaleTimeoutService afterSaleTimeoutService;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void sweepTimeouts() {
        int agreed = afterSaleTimeoutService.sweepSellerResponse();
        if (agreed > 0) {
            log.info("[AFTERSALE] 卖家超时未处理自动同意 {} 笔", agreed);
        }
        int closed = afterSaleTimeoutService.sweepReturnShip();
        if (closed > 0) {
            log.info("[AFTERSALE] 买家超时未回寄自动关闭 {} 笔", closed);
        }
    }
}
