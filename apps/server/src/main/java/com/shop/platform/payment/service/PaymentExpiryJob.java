package com.shop.platform.payment.service;

import com.shop.platform.infra.scheduler.JobLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 支付单超时关单。
 *
 * <p>过期后不再接受回调：一张 30 分钟前的支付单突然成功，只会让订单侧陷入"该不该发货"的纠结。
 * 真到了那种情况，正确动作是退款，而不是把它当正常支付。
 *
 * <p>每批 500 条：一条只改一行，但关掉的单要能被回调路径立刻看见，所以批量不能太大。
 */
@Component
@ConditionalOnProperty(prefix = "shop.payment.expiry", name = "enabled", havingValue = "true", matchIfMissing = true)
public class PaymentExpiryJob {

    private static final Logger log = LoggerFactory.getLogger(PaymentExpiryJob.class);

    private static final int BATCH = 500;

    private final PaymentService payments;
    private final JobLock jobLock;

    public PaymentExpiryJob(PaymentService payments, JobLock jobLock) {
        this.payments = payments;
        this.jobLock = jobLock;
    }

    @Scheduled(fixedDelayString = "${shop.payment.expiry.interval:PT5M}", initialDelayString = "PT1M")
    public void closeExpired() {
        jobLock.withLock("shop.job.payment.expiry", () -> {
            int closed = payments.closeExpired(BATCH);
            if (closed > 0) {
                log.info("支付单超时关单：{} 条", closed);
            }
        });
    }
}
