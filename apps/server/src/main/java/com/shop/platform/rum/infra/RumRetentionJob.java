package com.shop.platform.rum.infra;

import com.shop.platform.rum.RumProperties;
import com.shop.platform.rum.mapper.RumEventMapper;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 明细保留：定期删掉超过保留期的遥测行。
 *
 * <p><b>它不承担正确性，只承担「这张表不能无限长」。</b>删早一轮晚一轮都不影响任何判定，
 * 所以它可以用最钝的做法：算一个截止时刻，一批一批删到删不动为止。
 *
 * <p>三条口径：
 *
 * <ol>
 *   <li><b>按 {@code created_at} 算，不按客户端的 {@code ts}。</b>后者是外部可控的——用它决定删不删，
 *       等于把「我们存多少数据」交给对面决定（写一个 2099 年的时间戳，这行就永远删不掉）。
 *   <li><b>分批删。</b>一次删光会持有一个长事务，跟这条链路上其他所有写撞在一起。每轮删得少、
 *       事务短，代价只是删得不那么干净——而清理本来就不需要干净。
 *   <li><b>不看 {@link RumProperties#isEnabled}。</b>关掉接收端只是不再收新数据，
 *       不等于已有数据可以一直躺着。这两件事没有关系。
 * </ol>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RumRetentionJob {

    /**
     * 每批的条数。取大一点是因为这里的一次「删」只是删索引行 + 标死元组，
     * 不像业务表那样要触发一连串副作用；5000 行的事务在毫秒量级。
     */
    private static final int BATCH_SIZE = 5000;

    /** 检查间隔 6 小时。保留期的粒度是天，但检查得勤一点每轮要删的就少——把删除摊平，不挑一个时刻集中做 */
    private static final long SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000L;

    private final RumEventMapper mapper;
    private final RumProperties properties;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void purgeExpired() {
        int days = properties.getRetentionDays();
        if (days <= 0) {
            // **兜底，不是功能**：这个键的默认值是 `minusDays(0)` = 删光全表，而它缺失的样子
            // （yml 里那行被人挪走）不会报任何错。清理作业把表清空是最难回滚的一类事故，值得一道显式闸门。
            log.warn("[RUM] retention-days={}，保留期不成立，本轮不清理", days);
            return;
        }
        OffsetDateTime cutoff = OffsetDateTime.now().minusDays(days);
        int total = 0;
        int handled;
        do {
            handled = mapper.deleteBatchBefore(cutoff, BATCH_SIZE);
            total += handled;
            // 删掉的行不再满足 created_at < cutoff，条件不会再命中它们，循环必然终止
        } while (handled == BATCH_SIZE);
        if (total > 0) {
            log.info("[RUM] 遥测明细清理 {} 行（保留 {} 天）", total, days);
        }
    }
}
