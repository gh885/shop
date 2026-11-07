package com.shop.platform.fulfillment.service;

import com.shop.platform.fulfillment.AutoReceiveProperties;
import com.shop.platform.fulfillment.mapper.PackageMapper;
import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import com.shop.platform.returns.api.RmaQuery;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 自动确认收货：发货后 N 天（默认 10 天）还没签收的包裹，系统替买家确认。
 *
 * <p>为什么必须有它：没有物流轨迹时，签收只有买家手点一条路。买家不点，订单永远停在
 * shipped，{@code OrderCompleted} 不发，商家的钱冻在 clearing 的 pending 里永远解冻不了。
 * 自动确认漏一次，商家的钱就永远不到账——所以扫描是<b>状态驱动</b>的：错过一轮的包裹
 * 还躺在扫描面里，下一轮照扫，自愈；"这轮到底跑没跑"由 {@code shop.job.*} 指标回答，
 * 不需要延时队列当第二保险。
 *
 * <p>签收与买家手点完全同一条写路径（{@link FulfillmentService#autoReceive}）：
 * CAS 谁先到谁赢，重复执行幂等，{@code delivered_source} 记 system 留痕。
 * 单包失败不挡同批其他包裹——失败的下一轮还在扫描面里。
 *
 * <p><b>避让未决售后。</b>子单上挂着未结案售后（含 {@code disputed}）就不替买家签收——
 * 货还在扯皮，把订单推到"已完成"等于当着纠纷的面解冻商家的钱。避让是暂时的：
 * 售后的每一段都有 deadline，必然收敛，结案后下一轮照常签收。曾经不做这条的理由
 * （"不该拿冻结所有正常商家的解冻去堵它"）只对无差别的全量冻结成立；按子单精确避让
 * 没有这个代价——没纠纷的单照常解冻。
 */
@Component
@ConditionalOnProperty(
        prefix = "shop.fulfillment.auto-receive",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class AutoReceiveJob implements ManualJob {

    private static final Logger log = LoggerFactory.getLogger(AutoReceiveJob.class);

    static final String JOB_NAME = "shop.job.fulfillment.auto-receive";

    /** 每批 200 个：一个包裹要 CAS + 跨模块回写 + 可能触发订单完成，不是单条 UPDATE。 */
    private static final int BATCH = 200;

    private final PackageMapper packages;
    private final FulfillmentService fulfillment;
    private final RmaQuery returns;
    private final JobLock jobLock;
    private final Duration after;

    public AutoReceiveJob(
            PackageMapper packages,
            FulfillmentService fulfillment,
            RmaQuery returns,
            JobLock jobLock,
            // 宽限期单一真相源在 AutoReceiveProperties：PackageView.autoReceiveAt 用同一个数
            AutoReceiveProperties properties) {
        this.packages = packages;
        this.fulfillment = fulfillment;
        this.returns = returns;
        this.jobLock = jobLock;
        this.after = Objects.requireNonNull(properties.after(), "after");
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(fixedDelayString = "${shop.fulfillment.auto-receive.interval:PT1H}", initialDelayString = "PT3M")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            Instant olderThan = Instant.now().minus(after);
            List<PackageMapper.PackageRow> due = packages.findAutoReceivableInternal(olderThan, BATCH);
            Set<UUID> disputed = returns.openCaseOrderIds(
                    due.stream().map(PackageMapper.PackageRow::sellerOrderId).toList());
            int received = 0;
            for (PackageMapper.PackageRow pkg : due) {
                if (disputed.contains(pkg.sellerOrderId())) {
                    // 未结案的子单先不签收：结案后下一轮照常，日志里能看见避让发生了多少次
                    continue;
                }
                try {
                    if (fulfillment.autoReceive(pkg.id())) {
                        received++;
                    }
                } catch (RuntimeException e) {
                    // 坏数据（订单行没了之类）不该挡住其他包裹解冻；下一轮还会扫到它
                    log.warn("自动确认收货失败，下一轮重试：package={}", pkg.id(), e);
                }
            }
            if (received > 0 || !disputed.isEmpty()) {
                log.info("自动确认收货：{} 个包裹，售后避让 {} 个子单", received, disputed.size());
            }
            return received;
        });
    }
}
