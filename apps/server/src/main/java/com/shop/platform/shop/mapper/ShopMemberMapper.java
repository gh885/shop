package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import java.time.OffsetDateTime;
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

    /**
     * 确认邀请的条件转移 PENDING → ACTIVE：守卫写死在 WHERE，与同时发生的撤回 / 拒绝（{@link #deletePendingById}）
     * 只有一方抢得到。曾是读出整行、{@code setStatus}、{@code updateById}——行被对方删掉时命中 0 行却照样
     * 打「成员确认加入」并把 ACTIVE 对象还给前端，人以为加进去了，库里没有这个人。
     *
     * @return 影响行数（1=加入成功，0=行不存在或已不是 PENDING，调用方给 409）
     */
    default int activatePending(UUID memberId, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<ShopMember>()
                        .eq(ShopMember::getId, memberId)
                        .eq(ShopMember::getStatus, MemberStatus.PENDING)
                        .set(ShopMember::getStatus, MemberStatus.ACTIVE)
                        .set(ShopMember::getUpdatedAt, now));
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

    /** 用户名下的店主身份对应哪些店（注销时逐个停营业；口径同 {@link #countOwnedShops}：OWNER 行，不看 shops.owner_id 冗余列） */
    default List<UUID> selectOwnedShopIds(UUID userId) {
        return selectList(new LambdaQueryWrapper<ShopMember>()
                        .eq(ShopMember::getUserId, userId)
                        .eq(ShopMember::getRole, MemberRole.OWNER))
                .stream()
                .map(ShopMember::getShopId)
                .toList();
    }

    /**
     * 账号注销清理（UserDeletedEvent 监听）：删本人全部成员行——店主身份、子账号身份、待确认邀请一起走。
     *
     * <p>与「店主移除成员」「被邀请人拒绝邀请」同为硬删（ACC-11/13 的既有语义就是离开即删行）。
     * 子账号那一侧尤其没有别的路：ACTIVE 成员离开本店只有店主移除一条通道（ACC-13），
     * 人已经注销了再要求「先由店主点移除」等于给他留一扇打不开的门。
     */
    default int deleteByUser(UUID userId) {
        return delete(new LambdaQueryWrapper<ShopMember>().eq(ShopMember::getUserId, userId));
    }
}
