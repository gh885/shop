package com.shop.platform.coupon.infra;

import com.shop.platform.coupon.mapper.UserCouponMapper;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 到期券收敛：把过了失效时刻的未使用券刷成 EXPIRED。
 *
 * <p><b>它不承担正确性。</b>「券能不能用」一律由读时的绝对时间判定，
 * 任务停摆只会让状态列落后于事实（券包里靠展示状态兜住），不会让过期券被用掉。
 * 它存在的意义是：让状态列可信（对账/统计按 status 查时不会把过期券算成未使用），以及收敛索引。
 *
 * <p>只扫 UNUSED：LOCKED 的券下单时优惠已定格在订单上，不能因为过期而让已下单的支付失败。
 * 与订单超时任务同一套姿势：扫描间隔远小于业务窗口对延迟的敏感度（这里窗口是天级）。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class CouponExpiryJob {

    /** 每轮批量上限：一次别锁太多行，避免长事务拖住结算链路上的券行 */
    private static final int BATCH_SIZE = 500;

    /** 扫描间隔 10 分钟：券的有效期精度到分钟级足够，过期晚几分钟收敛不影响任何业务判定 */
    private static final long SCAN_INTERVAL_MS = 600_000;

    private final UserCouponMapper userCouponMapper;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void sweepExpired() {
        // 整轮共用一个 now：每批换一个时间点会让边界行的判定漂移，日志也难对齐
        OffsetDateTime now = OffsetDateTime.now();
        int total = 0;
        int handled;
        do {
            handled = userCouponMapper.expireDue(now, BATCH_SIZE);
            total += handled;
            // 收敛过的行状态已变，不会再被同一条件命中，循环必然终止
        } while (handled == BATCH_SIZE);
        if (total > 0) {
            log.info("[COUPON] 过期券收敛 {} 张", total);
        }
    }
}
