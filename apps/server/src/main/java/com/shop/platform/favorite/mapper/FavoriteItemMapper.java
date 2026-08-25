package com.shop.platform.favorite.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
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
}
