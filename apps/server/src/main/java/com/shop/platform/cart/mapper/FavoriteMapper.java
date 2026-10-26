package com.shop.platform.cart.mapper;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 收藏条目的读写。
 *
 * <p>归属形态与 {@code cart.items} 同一条规矩：所有 SQL 绑 {@code buyer_id}，
 * 不写「先查后比对」。条目按 {@code (buyer_id, spu_id)} 唯一，spuId 就是这个资源的自然键。
 *
 * <p><b>为什么没有行 id 的查询。</b> 前端在商品页手里只有 spuId；按它寻址天然幂等、跨设备稳定。
 * 行 id 是内部实现细节，暴露出去只会多一个「这个 id 是不是我的」的越权面。
 */
@Mapper
public interface FavoriteMapper {

    /**
     * 收藏。{@code ON CONFLICT DO NOTHING} 而不是「先查再插」：
     *
     * <p>并发下两个请求会双双查不到、双双插入，后一个撞唯一索引抛
     * {@code DuplicateKeyException}——而 PostgreSQL 里这个异常会**中止整个事务**，
     * 之后的语句全部报 {@code current transaction is aborted}，连回滚都做不干净。
     * 所以并发这条路不能靠 catch，只能靠 {@code ON CONFLICT}。
     *
     * <p>返回值是「这次真的插进去了吗」。重复收藏返回 false，调用方据此决定回 201 还是 200——
     * 但**不区分错误**：收藏是幂等开关，重复点不该是错误。
     */
    @Insert(
            """
            INSERT INTO cart.favorite_item (id, buyer_id, spu_id)
            VALUES (#{id}, #{buyerId}, #{spuId})
            ON CONFLICT (buyer_id, spu_id) DO NOTHING
            """)
    int insert(@Param("id") UUID id, @Param("buyerId") UUID buyerId, @Param("spuId") UUID spuId);

    /**
     * 取消收藏。0 行（本来就没收藏）静默通过——toggle 语义下「取消一个没收藏的东西」不是错误。
     */
    @Delete("DELETE FROM cart.favorite_item WHERE buyer_id = #{buyerId} AND spu_id = #{spuId}")
    int delete(@Param("buyerId") UUID buyerId, @Param("spuId") UUID spuId);

    /**
     * 收藏时间。重复收藏不刷新它——「什么时候收的」问的是第一次。
     * 刷新会让收藏列表按「最近点过心形」排序，而买家期望的是「我最近收了什么」。
     */
    @Select("SELECT created_at FROM cart.favorite_item WHERE buyer_id = #{buyerId} AND spu_id = #{spuId}")
    Optional<OffsetDateTime> findCreatedAt(@Param("buyerId") UUID buyerId, @Param("spuId") UUID spuId);

    /**
     * 列表第一页 / 后续页。游标是 {@code (created_at, id)} 复合键——
     * 只按时间比会串同一毫秒的行。
     *
     * <p>{@code beforeCreatedAt} / {@code beforeId} 同时为 null 时是第一页；
     * 只给其中一个就退化成「按时间只比一次」，所以 service 保证两者同生同死。
     *
     * <p><b>行比较写成 {@code (a, b) < (x, y)}，XML 里必须转义成 {@code &lt;}。</b>
     * 不转义的话 MyBatis 解析 {@code <script>} 时就当标签开始，SQL 里留下一个裸 {@code <}——
     * 报的是 {@code syntax error at or near "<"}，看不出跟转义有关。
     */
    @Select(
            """
            <script>
            SELECT id, spu_id AS spuId, created_at AS createdAt
              FROM cart.favorite_item
             WHERE buyer_id = #{buyerId}
            <if test="beforeCreatedAt != null">
               AND (created_at, id) &lt; (#{beforeCreatedAt}, #{beforeId})
            </if>
             ORDER BY created_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """)
    List<FavoriteRow> listPage(
            @Param("buyerId") UUID buyerId,
            @Param("beforeCreatedAt") OffsetDateTime beforeCreatedAt,
            @Param("beforeId") UUID beforeId,
            @Param("limit") int limit);

    /**
     * 批量查「这些商品我收藏了吗」。详情页心形状态、商品卡片小红心都用它——
     * 一个商品卡片列表有 24 个商品，逐个点查就是 24 次往返。
     */
    @Select(
            """
            <script>
            SELECT spu_id
              FROM cart.favorite_item
             WHERE buyer_id = #{buyerId}
               AND spu_id IN
               <foreach collection="spuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    List<UUID> favoritedSpuIds(@Param("buyerId") UUID buyerId, @Param("spuIds") Collection<UUID> spuIds);

    /** 总数。收藏页显示「共 N 件」；也是种类上限闸门的判据。 */
    @Select("SELECT count(*) FROM cart.favorite_item WHERE buyer_id = #{buyerId}")
    long countByBuyer(@Param("buyerId") UUID buyerId);

    /**
     * 注销时的整车清理。收藏没有任何行引用它，留着只会白养数据——
     * 而且是个保法口径下必须清的个人数据。
     */
    @Delete("DELETE FROM cart.favorite_item WHERE buyer_id = #{buyerId}")
    int deleteByBuyer(@Param("buyerId") UUID buyerId);

    /**
     * 列表一行。只带排序与定位需要的列；商品事实（标题/图/价）经 {@code catalog :: api}
     * 批查拼装，favorite 不存也不缓存它们。
     */
    record FavoriteRow(UUID id, UUID spuId, OffsetDateTime createdAt) {}
}
