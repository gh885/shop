package com.shop.platform.aftersale.infra;

import com.shop.platform.aftersale.mapper.Refund;
import com.shop.platform.aftersale.mapper.RefundMapper;
import com.shop.platform.aftersale.service.RefundExecutionService;
import com.shop.platform.common.Sweep;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 退款自动重试（§8「退款重试」）：退款中且上一次渠道调用已过退避窗口的单，逐笔再提交一次。
 *
 * <p>重试不改变退款单状态，只追加一条 {@code RefundExecution}；失败次数达到
 * {@link RefundExecutionService#MAX_ATTEMPTS} 时由执行入口转「失败」，等人工处置。
 * 退避窗口是为了不把一个刚失败的单在一秒内重试三次——渠道侧多半还没恢复，三次全撞在同一个原因上。
 *
 * <p>与超时任务同型：批次头部取数、逐笔经 {@link Sweep#each} 隔离、每笔独立事务（执行入口是另一个 bean）。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class RefundRetryJob {

    /** 扫描间隔 30s：与超时任务同频 */
    private static final long SCAN_INTERVAL_MS = 30_000;

    /** 退避窗口：同一笔退款两次渠道调用至少隔 1 分钟 */
    private static final Duration RETRY_BACKOFF = Duration.ofMinutes(1);

    /** 每批至多几笔：与超时任务同值（一笔一笔走独立事务，批越大单轮越久） */
    private static final int BATCH_LIMIT = 100;

    private final RefundMapper refundMapper;

    private final RefundExecutionService refundExecutionService;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void retryFailedRefunds() {
        List<Refund> candidates =
                refundMapper.selectRetryable(OffsetDateTime.now().minus(RETRY_BACKOFF), BATCH_LIMIT);
        int retried = Sweep.each(log, "退款自动重试", candidates, Refund::getId, refund -> {
            refundExecutionService.execute(refund.getId());
            return true;
        });
        if (retried > 0) {
            log.info("[REFUND] 自动重试 {} 笔", retried);
        }
    }
}
