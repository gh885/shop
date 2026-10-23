package com.shop.platform.clearing.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.clearing.events.ReconciliationBroken;
import com.shop.platform.common.id.Ids;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 对账坏账的告警出口：事件一到，ERROR 可见、指标可查。指标是告警规则的输入，
 * 多记不改变事实、漏记才是事故，所以这里只验证"记上了、记对了数"。
 */
class ReconciliationBrokenAlertsTest {

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final ReconciliationBrokenAlerts alerts = new ReconciliationBrokenAlerts(registry);

    @Test
    void 坏账轮次与各类差异条数都进指标() {
        alerts.on(new ReconciliationBroken(
                Ids.newId(),
                UUID.randomUUID(),
                List.of(
                        new ReconciliationBroken.KindCount("group_unbalanced", 2),
                        new ReconciliationBroken.KindCount("balance_mismatch", 5)),
                Instant.now()));

        assertThat(registry.get("shop.reconciliation.broken").counter().count()).isEqualTo(1.0);
        assertThat(registry.get("shop.reconciliation.findings")
                        .tag("kind", "group_unbalanced")
                        .counter()
                        .count())
                .isEqualTo(2.0);
        assertThat(registry.get("shop.reconciliation.findings")
                        .tag("kind", "balance_mismatch")
                        .counter()
                        .count())
                .isEqualTo(5.0);
    }
}
