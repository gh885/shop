package com.shop.platform.account.internal;

import com.shop.platform.account.service.AccountDeletionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 到期注销申请的扫描执行。
 *
 * <p>无分布式锁：资格判定全在 anonymize 的条件更新里（WHERE deleted_at IS NULL AND
 * deletion_requested_at &lt;= 冷静期线），多实例并发扫描同一行只有一个赢，锁是多余的。
 * 频率不需要高——注销本来就以「天」为单位，5 分钟一批只是让冷静期到点后别等太久。
 */
@Component
@ConditionalOnProperty(
        prefix = "shop.auth.account.deletion-sweep",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class AccountDeletionJob {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletionJob.class);

    private final AccountDeletionService deletionService;

    public AccountDeletionJob(AccountDeletionService deletionService) {
        this.deletionService = deletionService;
    }

    @Scheduled(fixedDelayString = "PT5M")
    public void sweep() {
        int done = deletionService.sweep();
        if (done > 0) {
            log.info("[ACCOUNT] 本轮注销落地 {} 笔", done);
        }
    }
}
