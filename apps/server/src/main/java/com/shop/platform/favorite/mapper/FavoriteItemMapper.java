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

@Mapper
public interface FavoriteItemMapper extends BaseMapper<FavoriteItem> {

    /** 本人某商品收藏行：幂等收藏查重与并发撞唯一索引后的回读共用 */
    default FavoriteItem selectByUserAndProduct(UUID userId, UUID productId) {
        return selectOne(new LambdaQueryWrapper<FavoriteItem>()
                .eq(FavoriteItem::getUserId, userId)
                .eq(FavoriteItem::getProductId, productId));
    }

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
