package com.shop.platform.infra.observability;

import com.shop.platform.infra.db.ReconcileProbe;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 应用内数据对账作业：定时调 {@link ReconcileProbe} 跑跨 schema 只读检查，发现不一致就打
 * {@code reconcile.mismatch} 事件（带 check 与 count），生产告警按 event 聚合。
 *
 * <p>分工：SQL 落点在 {@code infra.db}（架构规则只允许那里引 JdbcTemplate）；这里只管「什么时候跑、
 * 跑出来怎么报」——技术指标全绿、钱或库存却对不上的故障只有对账能发现，所以每条差异都要成为可告警的事件。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReconcileJob {

    private final ReconcileProbe reconcileProbe;

    @Scheduled(cron = "${shop.reconcile.cron:0 15 3 * * *}")
    public void run() {
        List<ReconcileProbe.Mismatch> mismatches = reconcileProbe.findMismatches();
        for (ReconcileProbe.Mismatch mismatch : mismatches) {
            BizEvent.of("reconcile.mismatch")
                    .put("check", mismatch.check())
                    .put("count", mismatch.count())
                    .warn();
        }
    }
}
