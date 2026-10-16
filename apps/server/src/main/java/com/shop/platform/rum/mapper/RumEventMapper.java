package com.shop.platform.rum.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.time.OffsetDateTime;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 遥测明细的写入与清理。
 *
 * <p>只有两个动作，都是自带语义的单一操作：插入一行（{@link BaseMapper#insert}）与按时间删一批。
 * **本接口刻意不暴露任何按业务的查询**——「哪个错误影响最多会话」这类问题要按指纹与时间窗聚合，
 * 那是查询期（第 2/3 期）的事，届时按那几个问题各写一个具名方法，而不是先在这里放一个万能 wrapper。
 *
 * <p>没有 UPDATE：明细行一旦落库就不变。
 */
@Mapper
public interface RumEventMapper extends BaseMapper<RumEvent> {

    /**
     * 删一批早于截止时刻的行，返回实际删掉的条数。
     *
     * <p>删的是 **created_at** 不是 ts：ts 是客户端给的，可以造假也可以漂——用它决定删不删，
     * 等于把「我们存多少数据」交给对面决定。
     *
     * <p>带 {@code LIMIT} 是这一条的全部要点：一次性删掉几百万行会持有一个长事务，
     * 而调用方（{@link com.shop.platform.rum.infra.RumRetentionJob}）是循环调它直到删不满一批为止。
     * 子查询选 id 而不是直接 {@code DELETE ... WHERE created_at < ?}，就是为了让 LIMIT 生效——
     * PG 的 DELETE 不吃 LIMIT。
     */
    @Delete(
            """
            DELETE FROM rum.rum_events
            WHERE id IN (
                SELECT id FROM rum.rum_events
                WHERE created_at < #{cutoff}
                LIMIT #{batchSize}
            )
            """)
    int deleteBatchBefore(@Param("cutoff") OffsetDateTime cutoff, @Param("batchSize") int batchSize);
}
