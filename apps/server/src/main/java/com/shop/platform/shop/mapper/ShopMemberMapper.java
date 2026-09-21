package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShopMemberMapper extends BaseMapper<ShopMember> {

    /** 用户全部 ACTIVE 成员身份（我的店铺列表用） */
    default List<ShopMember> selectActiveByUser(UUID userId) {
        return selectList(new LambdaQueryWrapper<ShopMember>()
                .eq(ShopMember::getUserId, userId)
                .eq(ShopMember::getStatus, MemberStatus.ACTIVE));
    }

    /** 用户待确认邀请（PENDING），新的在前 */
    default List<ShopMember> selectPendingByUser(UUID userId) {
        return selectList(new LambdaQueryWrapper<ShopMember>()
                .eq(ShopMember::getUserId, userId)
                .eq(ShopMember::getStatus, MemberStatus.PENDING)
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

    /**
     * 删待确认邀请（被邀请人拒绝 / 店主撤回的共用动作）：状态条件写在 WHERE 里，是并发闸门——
     * 与同时发生的 accept 相撞时只有一个是删除成功的那一个（影响行数 0 即对方已确认或邀请不在了，调用方给 409）。
     *
     * @return 影响行数（1=撤回/拒绝成功，0=行不存在或已不是 PENDING）
     */
    default int deletePendingById(UUID memberId) {
        return delete(new LambdaQueryWrapper<ShopMember>()
                .eq(ShopMember::getId, memberId)
                .eq(ShopMember::getStatus, MemberStatus.PENDING));
    }

    /** 是否该店 ACTIVE 成员：成员可见性校验用（过滤链已改用 findActiveMember 装载角色与权限） */
    default boolean isActiveMember(UUID shopId, UUID userId) {
        return selectCount(new LambdaQueryWrapper<ShopMember>()
                        .eq(ShopMember::getShopId, shopId)
                        .eq(ShopMember::getUserId, userId)
                        .eq(ShopMember::getStatus, MemberStatus.ACTIVE))
                > 0;
    }

    /** 该店该用户的 ACTIVE 成员行：卖家过滤链取整行顺带装载角色/权限到 ShopMemberContext，非成员返回 null */
    default ShopMember findActiveMember(UUID shopId, UUID userId) {
        return selectOne(new LambdaQueryWrapper<ShopMember>()
                .eq(ShopMember::getShopId, shopId)
                .eq(ShopMember::getUserId, userId)
                .eq(ShopMember::getStatus, MemberStatus.ACTIVE));
    }

    /** 是否该店 ACTIVE 店主（店主专属操作的 403 闸门） */
    default boolean isActiveOwner(UUID shopId, UUID userId) {
        return selectCount(new LambdaQueryWrapper<ShopMember>()
                        .eq(ShopMember::getShopId, shopId)
                        .eq(ShopMember::getUserId, userId)
                        .eq(ShopMember::getRole, MemberRole.OWNER)
                        .eq(ShopMember::getStatus, MemberStatus.ACTIVE))
                > 0;
    }

    /** 用户名下已拥有的店主身份数（一人一店闸门口径：OWNER 行数，被拒/被封店仍计数；不做状态豁免） */
    default long countOwnedShops(UUID userId) {
        return selectCount(new LambdaQueryWrapper<ShopMember>()
                .eq(ShopMember::getUserId, userId)
                .eq(ShopMember::getRole, MemberRole.OWNER));
    }
}
