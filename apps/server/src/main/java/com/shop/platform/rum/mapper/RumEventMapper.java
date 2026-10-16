package com.shop.platform.rum.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import java.time.OffsetDateTime;
import java.util.Map;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 遥测明细的读写。
 *
 * <p>写只有两个动作，都是自带语义的单一操作：插入一行（{@link BaseMapper#insert}）与按时间删一批。
 * 读只有三个具名方法（问题聚合 / 明细列表 / 按 id 取一行），**没有万能 wrapper**——「哪个错误影响
 * 最多会话」「这个指纹下都发生了什么」是各自独立的问题，各写一条，而不是让调用方在 service 里拼条件。
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

    /**
     * 问题列表：把事件按「指纹 + 端 + 种类」聚成一个个问题，按**影响会话数**降序。
     *
     * <p>分组键三个都留着而不是只按指纹：同一个指纹可能同时出现在 web 与 seller（共用组件里的一段
     * 代码），而「两端一起修」和「各修各的」是两回事，合成一行会把影响面算错。
     *
     * <p>{@code fingerprint IS NOT NULL} 是这条查询成立的前提，不是优化：性能与接口事件没有指纹，
     * 不过滤就是**全部没有指纹的事件聚成一个巨大的空指纹桶**，它按会话数一定排在第一，把真问题顶到第二页。
     *
     * <p>窗口按 {@code created_at} 不按 {@code ts}：ts 是客户端给的，能漂也能造假；而且保留清理
     * 也是按 created_at 走的，两者同一把尺子才不会出现「聚合出来的行已经过了保留期」。
     *
     * <p>ORDER BY 末尾补上三个分组键是为了**全序**：只按 sessions 排，值相同的组在两次查询里顺序可以不同，
     * 翻页时就会出现同一行看两遍、另一行一次都不出现。
     */
    default Page<Map<String, Object>> selectIssuePage(
            PageParams pageParams, String app, String kind, OffsetDateTime from, OffsetDateTime to) {
        Page<Map<String, Object>> page = new Page<>(pageParams.page(), pageParams.size());
        // 关掉 count 语句的「优化」：MP 默认会试着把 GROUP BY 摘掉再 count(*)，那数出来的是行数不是组数，
        // 前端分页器会凭空多出几十页。关掉之后走的是 SELECT COUNT(*) FROM (原SQL) TOTAL —— 包一层才对
        page.setOptimizeCountSql(false);
        return selectMapsPage(
                page,
                new QueryWrapper<RumEvent>()
                        .select(
                                "fingerprint",
                                "app",
                                "kind",
                                // 代表值：同一指纹的 message 只在被指纹抹掉的片段（数字/UUID）上不同，取哪个都认得出是同一个问题
                                "min(message) AS message",
                                "min(route) AS route",
                                "count(DISTINCT session_id) AS sessions",
                                "count(*) AS events",
                                "min(created_at) AS first_seen",
                                "max(created_at) AS last_seen")
                        .isNotNull("fingerprint")
                        .ne("fingerprint", "")
                        .eq(app != null, "app", app)
                        .eq(kind != null, "kind", kind)
                        .ge(from != null, "created_at", from)
                        .lt(to != null, "created_at", to)
                        .groupBy("fingerprint", "app", "kind")
                        .orderByDesc("sessions", "events", "fingerprint", "app", "kind"));
    }

    /**
     * 明细列表：按指纹 / 端 / 种类 / 路由 / 时间窗任意组合筛，一律最新在前。
     *
     * <p>**不取 {@code payload}**：整条原件几 KB，而列表只要摘要。原件由 {@link #selectById} 单条取。
     */
    default Page<RumEvent> selectEventPage(
            PageParams pageParams,
            String fingerprint,
            String app,
            String kind,
            String route,
            OffsetDateTime from,
            OffsetDateTime to) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<RumEvent>()
                        // 列宽 1000 的 payload 是全表最宽的一列，列表页把它拉回来纯属浪费带宽与内存
                        .select(
                                RumEvent::getId,
                                RumEvent::getTs,
                                RumEvent::getCreatedAt,
                                RumEvent::getApp,
                                RumEvent::getKind,
                                RumEvent::getName,
                                RumEvent::getVersion,
                                RumEvent::getEnv,
                                RumEvent::getRoute,
                                RumEvent::getSessionId,
                                RumEvent::getUserId,
                                RumEvent::getFingerprint,
                                RumEvent::getMessage)
                        .eq(fingerprint != null, RumEvent::getFingerprint, fingerprint)
                        .eq(app != null, RumEvent::getApp, app)
                        .eq(kind != null, RumEvent::getKind, kind)
                        .eq(route != null, RumEvent::getRoute, route)
                        .ge(from != null, RumEvent::getCreatedAt, from)
                        .lt(to != null, RumEvent::getCreatedAt, to)
                        // created_at 可能同毫秒，补 id 拿全序——否则翻页会重复/漏行
                        .orderByDesc(RumEvent::getCreatedAt, RumEvent::getId));
    }
}
