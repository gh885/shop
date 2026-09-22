package com.shop.platform.account.infra;

import com.shop.platform.account.service.AccountDeletionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 注销到期扫描：把冷静期满且未撤销的申请交给 {@link AccountDeletionService#sweep()} 执行。
 *
 * <p>一小时一轮足够——窗口是 15 天量级，生效时刻晚一小时没有任何后果；反过来说，注销是不可逆动作，
 * 也不需要「精确到秒」的执行时点。与订单/售后侧的超时任务同型：无分布式锁，资格判定收在条件更新里。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class AccountDeletionJob {

    private static final long SCAN_INTERVAL_MS = 3_600_000;

    private final AccountDeletionService accountDeletionService;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void sweepDeletions() {
        int executed = accountDeletionService.sweep();
        if (executed > 0) {
            log.info("[ACCOUNT] 冷静期满注销生效 {} 笔", executed);
        }
    }
}
