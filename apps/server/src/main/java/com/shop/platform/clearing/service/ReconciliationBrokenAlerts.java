package com.shop.platform.clearing.service;

import com.shop.platform.clearing.events.ReconciliationBroken;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 对账坏账的告警出口。{@code ReconciliationBroken} 发出时记 ERROR 日志和指标——
 * 在此之前坏账的痕迹是 service 里一行 WARN，而那正是没人会去看的东西。
 *
 * <p>指标两条：{@code shop.reconciliation.broken}（发现差异的轮次，告警规则盯增量）、
 * {@code shop.reconciliation.findings}（tag: kind，差异真实条数——不是被截断的样本数）。
 *
 * <p>不做 EventInbox 去重：指标是累加语义，事件重投多记一次不改变"账坏了"这个事实，
 * 而这条链路上唯一怕重复的是有状态消费者。
 */
@Component
public class ReconciliationBrokenAlerts {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationBrokenAlerts.class);

    private final MeterRegistry registry;

    public ReconciliationBrokenAlerts(MeterRegistry registry) {
        this.registry = Objects.requireNonNull(registry, "registry");
    }

    @ApplicationModuleListener
    public void on(ReconciliationBroken event) {
        log.error("对账发现差异：runId={} 差异={}。只报告不抹平，明细在 clearing.reconciliation_run，需人工核对", event.runId(), event.counts());
        Counter.builder("shop.reconciliation.broken")
                .description("发现差异的对账轮次")
                .register(registry)
                .increment();
        for (ReconciliationBroken.KindCount count : event.counts()) {
            Counter.builder("shop.reconciliation.findings")
                    .tag("kind", count.kind())
                    .description("对账发现的差异条数（真实数量，非样本数），按差异类型")
                    .register(registry)
                    .increment(count.count());
        }
    }
}
