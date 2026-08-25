package com.shop.platform.cart.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CartItemMapper extends BaseMapper<CartItem> {

    /** 本人某 SKU 条目：加购合并与并发撞唯一索引后的回读共用 */
    default CartItem selectByUserAndSku(UUID userId, UUID skuId) {
        return selectOne(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .eq(CartItem::getSkuId, skuId));
    }

    /** 整车条目，新加的在前 */
    default List<CartItem> selectWholeCart(UUID userId) {
        return selectList(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .orderByDesc(CartItem::getCreatedAt));
    }

    /** 整车条目数（角标） */
    default long countByUser(UUID userId) {
        return selectCount(new LambdaQueryWrapper<CartItem>().eq(CartItem::getUserId, userId));
    }

    /** 勾选条目数（角标） */
    default long countSelectedByUser(UUID userId) {
        return selectCount(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .eq(CartItem::getSelected, true));
    }

    /**
     * 按本人归属批量删：结算清理、移除失效、删除选中共用；userId 圈定防误删他人条目。
     *
     * @return 实际删除行数
     */
    default int deleteByUserAndIds(UUID userId, Collection<UUID> ids) {
        return delete(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .in(CartItem::getId, ids));
    }
}
