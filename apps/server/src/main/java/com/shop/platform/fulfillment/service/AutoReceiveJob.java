package com.shop.platform.fulfillment.service;

import com.shop.platform.fulfillment.mapper.PackageMapper;
import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
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
 * <p><b>已知取舍：</b>不判"这一单有没有未决售后"。买家已申请仅退款时订单照样自动完成，
 * 退款走售后的分录从商家可用余额扣——商家欠平台和买家收不到货是两件事，
 * 不该拿冻结所有正常商家的解冻去堵它。轨迹落地后锚点切换见 fulfillment.md「确认收货」。
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
    private final JobLock jobLock;
    private final Duration after;

    public AutoReceiveJob(
            PackageMapper packages,
            FulfillmentService fulfillment,
            JobLock jobLock,
            // P10D 不是 PT10D：T 后面只跟时分秒，天数在 T 前——Duration.parse 不认 PT10D
            @Value("${shop.fulfillment.auto-receive.after:P10D}") Duration after) {
        this.packages = packages;
        this.fulfillment = fulfillment;
        this.jobLock = jobLock;
        this.after = Objects.requireNonNull(after, "after");
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
            int received = 0;
            for (PackageMapper.PackageRow pkg : packages.findAutoReceivable(olderThan, BATCH)) {
                try {
                    if (fulfillment.autoReceive(pkg.id())) {
                        received++;
                    }
                } catch (RuntimeException e) {
                    // 坏数据（订单行没了之类）不该挡住其他包裹解冻；下一轮还会扫到它
                    log.warn("自动确认收货失败，下一轮重试：package={}", pkg.id(), e);
                }
            }
            if (received > 0) {
                log.info("自动确认收货：{} 个包裹", received);
            }
            return received;
        });
    }
}
