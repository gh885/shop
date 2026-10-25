package com.shop.platform.fulfillment.service;

import com.shop.platform.fulfillment.mapper.ShipTaskMapper;
import com.shop.platform.governance.api.GovernanceCommand;
import com.shop.platform.governance.api.ViolationKind;
import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import com.shop.platform.trade.api.TradeQuery;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 发货时效检测：承诺时间（付款 + 48h）到了还没发的任务置 {@code overdue}，线索报给 governance。
 *
 * <p><b>检测在这里，处置在 governance。</b> 扣多少分、要不要限流是治理的事——governance 这一版
 * 只把线索记下来给人看（管理端清单），不做任何自动处罚。
 *
 * <p>两类任务<b>不算</b>超时，作废了事：订单已关闭、还没发货就全额退款（可发量为 0）。
 * 不判这两种就会把"商家正确地没发货"报成违规——检测的信誉比覆盖率重要。
 *
 * <p>置 overdue 与报线索不在一个事务里（跨模块），中间断了会留下"任务已 overdue、
 * 线索没报"的窗口；线索侧 {@code uq_clue_order} 幂等，补报不会重复，差异靠管理端清单对出来。
 */
@Component
@ConditionalOnProperty(
        prefix = "shop.fulfillment.ship-deadline",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class ShipDeadlineJob implements ManualJob {

    private static final Logger log = LoggerFactory.getLogger(ShipDeadlineJob.class);

    static final String JOB_NAME = "shop.job.fulfillment.ship-deadline";

    private static final int BATCH = 200;

    private final ShipTaskMapper shipTasks;
    private final TradeQuery trades;
    private final GovernanceCommand governance;
    private final JobLock jobLock;

    public ShipDeadlineJob(ShipTaskMapper shipTasks, TradeQuery trades, GovernanceCommand governance, JobLock jobLock) {
        this.shipTasks = shipTasks;
        this.trades = trades;
        this.governance = governance;
        this.jobLock = jobLock;
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(fixedDelayString = "${shop.fulfillment.ship-deadline.interval:PT1H}", initialDelayString = "PT5M")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            int flagged = 0;
            int cancelled = 0;
            for (ShipTaskMapper.TaskRow task : shipTasks.findPendingDue(Instant.now(), BATCH)) {
                try {
                    TradeQuery.Shippable order =
                            trades.findShippable(task.sellerOrderId()).orElse(null);
                    if (order == null) {
                        // 任务是 OrderPaid 建的，订单不该消失；消失了说明数据坏了，让人看见而不是静默
                        log.warn("发货任务对应的子单不存在：sellerOrder={}", task.sellerOrderId());
                        continue;
                    }
                    if (order.closed() || order.lines().stream().noneMatch(line -> line.remaining() > 0)) {
                        // 已关闭，或没发货就全退了：商家正确地没发货，作废任务而不是报违规
                        shipTasks.cancel(task.sellerOrderId());
                        cancelled++;
                        continue;
                    }
                    if (shipTasks.markOverdue(task.sellerOrderId())) {
                        governance.report(new GovernanceCommand.ViolationClue(
                                ViolationKind.SHIP_OVERDUE,
                                task.merchantId(),
                                task.sellerOrderId(),
                                Instant.now(),
                                "承诺发货 " + task.dueAt() + " 前未发货"));
                        flagged++;
                    }
                } catch (RuntimeException e) {
                    // 单条失败不挡同批其他任务；失败的还是 pending，下一轮照扫
                    log.warn("发货时效检测失败，下一轮重试：sellerOrder={}", task.sellerOrderId(), e);
                }
            }
            if (flagged + cancelled > 0) {
                log.info("发货时效检测：超时 {} 单，作废 {} 单", flagged, cancelled);
            }
            return flagged;
        });
    }
}
