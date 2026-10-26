package com.shop.platform.catalog.mapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 标准品的运营侧读写：列表、合并、挂靠改指、找终点。
 *
 * <p>标准品是 {@code catalog.spu} 里 {@code spu_type = 'standard'} 的行，没有独立表。
 * 合并态靠 {@code merged_into IS NOT NULL} 表达，没有 status 列——见迁移
 * {@code V20261026130000} 的注释。
 *
 * <p><b>所有查询都带 {@code spu_type = 'standard'}。</b> 漏了它，商家 SPU 会混进标准品列表，
 * 而运营点「合并」时合掉的会是一个真实在卖的商品。
 */
@Mapper
public interface StandardSpuMapper {

    /**
     * 顺着 {@code merged_into} 找到最终可用的那一行。
     *
     * <p><b>用递归 CTE 而不是循环查。</b> 合并可以链式发生（A 并入 B，B 后又并入 C），
     * 而链长不受控——循环查要 N 次往返，且中途没有一致的快照。
     *
     * <p>{@code depth < 20} 是防御：正常情况下链长不会超过两三跳，而数据坏掉时
     * 没有上限的递归会跑满内存。{@code ck_spu_merged_not_self} 挡了自指，
     * 但 A→B→A 这种两行互指只能靠深度上限兜。
     *
     * <p>返回的 id 可能是「还没被合并」的那一行（即入参自己），也可能为空（行不存在）。
     */
    @Select(
            """
            WITH RECURSIVE walk(id, merged_into, depth) AS (
                SELECT id, merged_into, 0 FROM catalog.spu
                 WHERE id = #{spuId} AND spu_type = 'standard'
                UNION ALL
                SELECT s.id, s.merged_into, w.depth + 1
                  FROM walk w
                  JOIN catalog.spu s ON s.id = w.merged_into
                 WHERE w.merged_into IS NOT NULL AND w.depth < 20
            )
            SELECT id FROM walk WHERE merged_into IS NULL ORDER BY depth DESC LIMIT 1
            """)
    Optional<UUID> findMergeTarget(@Param("spuId") UUID spuId);

    /**
     * 一个标准品的运营视图。
     *
     * <p>带 {@code boundCount}：运营判「这条该不该合」时，看的就是有多少商家挂在上面。
     * 挂 3 个的标准品和挂 300 个的，合并方向的取舍完全不同。
     */
    @Select(
            """
            SELECT s.id            AS spuId,
                   s.title         AS title,
                   s.category_id   AS categoryId,
                   s.brand_id      AS brandId,
                   s.model_no      AS modelNo,
                   s.identity_kind AS identityKind,
                   s.match_key     AS matchKey,
                   s.merged_into   AS mergedInto,
                   s.created_at    AS createdAt,
                   (SELECT count(*) FROM catalog.spu m
                     WHERE m.standard_spu_id = s.id AND m.spu_type = 'merchant') AS boundCount
              FROM catalog.spu s
             WHERE s.id = #{spuId} AND s.spu_type = 'standard'
            """)
    Optional<StandardSpuRow> find(@Param("spuId") UUID spuId);

    /**
     * 管理端列表。<b>默认含已合并的</b>——运营要能看到「这条被并到哪儿了」，
     * 否则合并错了无从追溯，只能翻审计。
     *
     * <p>{@code includeMerged = false} 时只出可用的，给「选一个标准品来挂靠」的场景用。
     */
    @Select(
            """
            <script>
            SELECT s.id            AS spuId,
                   s.title         AS title,
                   s.category_id   AS categoryId,
                   s.brand_id      AS brandId,
                   s.model_no      AS modelNo,
                   s.identity_kind AS identityKind,
                   s.match_key     AS matchKey,
                   s.merged_into   AS mergedInto,
                   s.created_at    AS createdAt,
                   (SELECT count(*) FROM catalog.spu m
                     WHERE m.standard_spu_id = s.id AND m.spu_type = 'merchant') AS boundCount
              FROM catalog.spu s
             WHERE s.spu_type = 'standard'
            <if test="categoryId != null">
               AND s.category_id = #{categoryId}
            </if>
            <if test="keyword != null and keyword != ''">
               AND (s.title ILIKE '%' || #{keyword} || '%'
                    OR s.model_no ILIKE '%' || #{keyword} || '%'
                    OR s.match_key ILIKE '%' || #{keyword} || '%')
            </if>
            <if test="!includeMerged">
               AND s.merged_into IS NULL
            </if>
             ORDER BY (SELECT count(*) FROM catalog.spu m
                        WHERE m.standard_spu_id = s.id AND m.spu_type = 'merchant') DESC,
                      s.created_at DESC
             LIMIT #{limit}
            </script>
            """)
    List<StandardSpuRow> list(
            @Param("categoryId") UUID categoryId,
            @Param("keyword") String keyword,
            @Param("includeMerged") boolean includeMerged,
            @Param("limit") int limit);

    /**
     * 把挂 {@code sourceId} 的商家 SPU 全部改指 {@code targetId}。<b>一条 UPDATE，不逐行读改写。</b>
     *
     * <p>{@code standard_matched_by} 也改成 {@code manual}：这些挂靠关系现在有了人工判断，
     * 说它还是「按型号自动匹配的」就是撒谎，而这一列是排查「为什么这两个商品归到一起了」的唯一线索。
     *
     * <p>只改 {@code spu_type = 'merchant'}：标准品不该挂在别的标准品上
     * （{@code ck_spu_standard_leaf} 已挡，这里再挡一次是因为这条 SQL 由运营触发，
     * 而运营的误操作不该依赖一条 CHECK 去接）。
     */
    @Update(
            """
            UPDATE catalog.spu
               SET standard_spu_id = #{targetId},
                   standard_matched_by = 'manual'
             WHERE standard_spu_id = #{sourceId} AND spu_type = 'merchant'
            """)
    int repointBound(@Param("sourceId") UUID sourceId, @Param("targetId") UUID targetId);

    /**
     * 标记合并。<b>条件更新</b>：{@code merged_into IS NULL} 保证并发下只有一次成功。
     *
     * <p>0 行是判决——说明这一行已经被别人并走了，调用方必须当冲突报出来，
     * 不能吞掉（吞掉就会出现「两个运营同时合并到不同目标，最后一个覆盖前一个」）。
     */
    @Update(
            """
            UPDATE catalog.spu
               SET merged_into = #{targetId}
             WHERE id = #{sourceId} AND spu_type = 'standard' AND merged_into IS NULL
            """)
    int markMerged(@Param("sourceId") UUID sourceId, @Param("targetId") UUID targetId);

    /**
     * 人工挂靠 / 取消挂靠（{@code standardSpuId} 传 null 即取消）。
     *
     * <p>归属写进 SQL（{@code merchant_id = #{merchantId}}），不是查出来再比对——
     * 后者每次新增一条写就多一个忘比对的机会。
     *
     * <p>{@code spu_type = 'merchant'} 同样进 WHERE：标准品不能挂到标准品上。
     *
     * <p><b>两处 {@code CAST} 不是可选的装饰。</b> {@code CASE WHEN ? IS NULL} 会让 PostgreSQL
     * 推断不出这个参数的类型（报 {@code could not determine data type of parameter $2}）——
     * 它既要和 NULL 比、又要和 uuid 列比，而 JDBC 传的是无类型参数。
     * 显式 {@code CAST(#{x} AS uuid)} 把类型钉死。
     */
    @Update(
            """
            UPDATE catalog.spu
               SET standard_spu_id = CAST(#{standardSpuId} AS uuid),
                   standard_matched_by = CASE WHEN CAST(#{standardSpuId} AS uuid) IS NULL
                                              THEN NULL ELSE 'manual' END
             WHERE id = #{spuId} AND merchant_id = #{merchantId} AND spu_type = 'merchant'
            """)
    int bind(
            @Param("spuId") UUID spuId,
            @Param("merchantId") UUID merchantId,
            @Param("standardSpuId") UUID standardSpuId);

    /** 标准品列表的一行。{@code mergedInto} 非空 = 已被合并。 */
    record StandardSpuRow(
            UUID spuId,
            String title,
            UUID categoryId,
            UUID brandId,
            String modelNo,
            String identityKind,
            String matchKey,
            UUID mergedInto,
            java.time.OffsetDateTime createdAt,
            long boundCount) {}
}
