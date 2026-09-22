package com.shop.platform.favorite.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface FavoriteItemMapper extends BaseMapper<FavoriteItem> {

    /**
     * 收藏落库的唯一语句：收藏是幂等开关，已收藏则原样返回既有行（DO UPDATE 写回同值只为让 RETURNING 出行，
     * DO NOTHING 撞冲突时不返回任何行）。
     *
     * <p>做成 upsert 而不是「先查再插、撞唯一索引后 catch 回读」：PG 一旦因唯一索引报错就把整个事务标记为
     * aborted，catch 之后的任何语句都会 25P02 失败（pgjdbc 默认 autosave=never，不打 savepoint），回读路径
     * 根本执行不到。id / created_at 由列默认值生成。
     */
    @Select("INSERT INTO favorite.items (user_id, product_id) VALUES (#{userId}, #{productId})"
            + " ON CONFLICT (user_id, product_id) DO UPDATE SET product_id = EXCLUDED.product_id"
            + " RETURNING *")
    FavoriteItem upsertIdempotent(@Param("userId") UUID userId, @Param("productId") UUID productId);

    /** 取消收藏：收藏是开关不是行管理，不存在也是 0 行 */
    default int deleteByUserAndProduct(UUID userId, UUID productId) {
        return delete(new LambdaQueryWrapper<FavoriteItem>()
                .eq(FavoriteItem::getUserId, userId)
                .eq(FavoriteItem::getProductId, productId));
    }

    /** 我的收藏分页，新收藏在前（商品卡片数据由调用侧拼装） */
    default Page<FavoriteItem> selectPageByUser(UUID userId, long page, long size) {
        return selectPage(
                new Page<>(page, size),
                new LambdaQueryWrapper<FavoriteItem>()
                        .eq(FavoriteItem::getUserId, userId)
                        .orderByDesc(FavoriteItem::getCreatedAt));
    }

    /** 批量查已收藏行（详情页「是否已收藏」），调用方取 productIds */
    default List<FavoriteItem> selectByUserAndProducts(UUID userId, Collection<UUID> productIds) {
        return selectList(new LambdaQueryWrapper<FavoriteItem>()
                .eq(FavoriteItem::getUserId, userId)
                .in(FavoriteItem::getProductId, productIds));
    }

    /**
     * 全站各商品收藏人数：列表页「N人收藏」用（统计所有用户，非本人）。
     * 只 count 不 join——收藏量是收藏夹自有指标，跨模块读商品信息在 service 层拼装。
     */
    default Map<UUID, Long> collectCountByProductIds(Collection<UUID> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        return selectMaps(new QueryWrapper<FavoriteItem>()
                        .select("product_id", "count(*) AS cnt")
                        .in("product_id", productIds)
                        .groupBy("product_id"))
                .stream()
                .collect(Collectors.toMap(m -> toUuid(m.get("product_id")), m -> ((Number) m.get("cnt")).longValue()));
    }

    /**
     * 账号注销清理（UserDeletedEvent 监听）：收藏是「我喜欢什么」的偏好数据，人走了不留（ACC-76）。
     * 与取消收藏同为硬删——本表是纯追加删除表，行永远不被 UPDATE。
     */
    default int deleteByUser(UUID userId) {
        return delete(new LambdaQueryWrapper<FavoriteItem>().eq(FavoriteItem::getUserId, userId));
    }

    /**
     * uuid 列经 selectMaps 返回的值，PG JDBC 驱动可能给 {@link UUID} 或 {@link String}（取决版本/配置），
     * 两者都收口成 {@link UUID}，避免 {@code (String)} 强转在 UUID 类型下抛 ClassCastException。
     */
    private static UUID toUuid(Object value) {
        if (value instanceof UUID uuid) {
            return uuid;
        }
        if (value instanceof String s) {
            return UUID.fromString(s);
        }
        throw new IllegalArgumentException("product_id 列返回了意外的类型: " + value.getClass());
    }
}
