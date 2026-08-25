package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShopMemberMapper extends BaseMapper<ShopMember> {

    /** 用户全部 ACTIVE 成员身份（我的店铺列表用） */
    default List<ShopMember> selectActiveByUser(UUID userId) {
        return selectList(new LambdaQueryWrapper<ShopMember>()
                .eq(ShopMember::getUserId, userId)
                .eq(ShopMember::getStatus, ShopMember.STATUS_ACTIVE));
    }

    /** 用户待确认邀请（PENDING），新的在前 */
    default List<ShopMember> selectPendingByUser(UUID userId) {
        return selectList(new LambdaQueryWrapper<ShopMember>()
                .eq(ShopMember::getUserId, userId)
                .eq(ShopMember::getStatus, ShopMember.STATUS_PENDING)
                .orderByDesc(ShopMember::getCreatedAt));
    }

    /** 店铺全体成员，先加入的在前 */
    default List<ShopMember> selectByShop(UUID shopId) {
        return selectList(new LambdaQueryWrapper<ShopMember>()
                .eq(ShopMember::getShopId, shopId)
                .orderByAsc(ShopMember::getCreatedAt));
    }

    /** 同店同人是否已有成员记录（邀请防重；并发由 uk_shop_members_shop_user 兜底） */
    default boolean existsByShopAndUser(UUID shopId, UUID userId) {
        return selectCount(new LambdaQueryWrapper<ShopMember>()
                        .eq(ShopMember::getShopId, shopId)
                        .eq(ShopMember::getUserId, userId))
                > 0;
    }

    /** 是否该店 ACTIVE 成员：卖家接口过滤链（ShopMembershipFilter）与成员可见性校验共用同一闸门 */
    default boolean isActiveMember(UUID shopId, UUID userId) {
        return selectCount(new LambdaQueryWrapper<ShopMember>()
                        .eq(ShopMember::getShopId, shopId)
                        .eq(ShopMember::getUserId, userId)
                        .eq(ShopMember::getStatus, ShopMember.STATUS_ACTIVE))
                > 0;
    }

    /** 是否该店 ACTIVE 店主（店主专属操作的 403 闸门） */
    default boolean isActiveOwner(UUID shopId, UUID userId) {
        return selectCount(new LambdaQueryWrapper<ShopMember>()
                        .eq(ShopMember::getShopId, shopId)
                        .eq(ShopMember::getUserId, userId)
                        .eq(ShopMember::getRole, ShopMember.ROLE_OWNER)
                        .eq(ShopMember::getStatus, ShopMember.STATUS_ACTIVE))
                > 0;
    }
}
