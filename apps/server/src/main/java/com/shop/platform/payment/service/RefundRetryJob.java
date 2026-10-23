package com.shop.platform.payment.service;

import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.payment.mapper.RefundOrderStore;
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
 * 退款重试。
 *
 * <p>没有它，渠道一次抖动（网络超时、渠道返回"稍后再试"）就把退款单永远钉在 {@code pending}，
 * 售后单卡在 {@code refunding}——买家没拿到钱，商家的钱冻在 clearing，唯一的出路是人工改库。
 * 首试失败的兜底必须是一条自动重试的路，而不是一句"等重试或人工"的注释。
 *
 * <p>成功路径与首试同一条：{@code RefundService.retryPending} → 渠道 → CAS → {@code RefundSucceeded}，
 * 售后单完成、账本冲销都由下游事件驱动，这里不重复任何业务判断。
 *
 * <p>重试有上限（{@code max-attempts}）：超限的留在 pending 里不再捞，靠 WARN 让人看见——
 * 跟事件补发一个道理，一个永远失败的退款单不该被打成风扇。扫到落库之间被同步路径推进的单子，
 * {@code retryPending} 会按状态直接跳过，不重复发事件。
 */
@Component
@ConditionalOnProperty(
        prefix = "shop.payment.refund-retry",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class RefundRetryJob {

    private static final Logger log = LoggerFactory.getLogger(RefundRetryJob.class);

    private static final int BATCH = 100;

    private final RefundOrderStore refunds;
    private final RefundService refundService;
    private final JobLock jobLock;
    private final Duration minAge;
    private final int maxAttempts;

    public RefundRetryJob(
            RefundOrderStore refunds,
            RefundService refundService,
            JobLock jobLock,
            @Value("${shop.payment.refund-retry.min-age:PT5M}") Duration minAge,
            @Value("${shop.payment.refund-retry.max-attempts:10}") int maxAttempts) {
        this.refunds = refunds;
        this.refundService = refundService;
        this.jobLock = jobLock;
        this.minAge = Objects.requireNonNull(minAge, "minAge");
        this.maxAttempts = maxAttempts;
    }

    @Scheduled(
            fixedDelayString = "${shop.payment.refund-retry.interval:PT5M}",
            initialDelayString = "${shop.payment.refund-retry.initial-delay:PT2M}")
    public void retryStuck() {
        jobLock.withLock("shop.job.payment.refund-retry", () -> {
            // 只捞够老的：刚失败的还在同步路径的手掌心里，太早重试会和它赛跑
            Instant olderThan = Instant.now().minus(minAge);
            int candidates = 0;
            int succeeded = 0;
            for (RefundOrderStore.RefundRow refund : refunds.findStalePending(olderThan, BATCH, maxAttempts)) {
                candidates++;
                try {
                    if (refundService.retryPending(refund)) {
                        succeeded++;
                    }
                } catch (RuntimeException e) {
                    // 坏数据（支付单被删之类）不该挡住其余退款；计一次尝试，超上限自然沉底
                    log.warn("退款重试异常：refund={}", refund.id(), e);
                    refunds.incrementAttempts(refund.id());
                }
            }
            if (candidates > 0) {
                log.info("退款重试：候选 {} 条，成功 {} 条", candidates, succeeded);
            }
        });
    }
}
