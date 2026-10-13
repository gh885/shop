package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

/**
 * 店主成员行访问。
 *
 * <p>子账号改造后，本表不再有「成员」这一种行：子账号是独立凭证（account 域），店与它的绑定写在凭证行上。
 * 表里只剩开店时写入的 OWNER 行，承载两件事——「一人一店」的名额判定（{@link #countOwnedShops}）与
 * 店铺归属/店主闸门（{@link #isActiveOwner}）。因此这里没有邀请态、没有整行回写，也就没有第二写者列。
 */
@Mapper
public interface ShopMemberMapper extends BaseMapper<ShopMember> {

    /** 用户全部 ACTIVE 店主身份（我的店铺列表用） */
    default List<ShopMember> selectActiveByUser(UUID userId) {
        return selectList(new LambdaQueryWrapper<ShopMember>()
                .eq(ShopMember::getUserId, userId)
                .eq(ShopMember::getStatus, MemberStatus.ACTIVE));
    }

    /** 该店该用户的 ACTIVE 成员行：卖家过滤链取整行顺带装载角色/权限到 ShopMemberContext，非店主返回 null */
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
     * 账号注销清理（UserDeletedEvent 监听）：删本人全部店主行。
     *
     * <p>店主的店不删、只停营业（ACC-76）：一个人注销了，他店里的子账号凭证仍在（那些是别人的工作身份，
     * 追责锚点不该跟着店主的账号消失），但店已经不可营业，子账号登进来也做不了任何事。
     */
    default int deleteByUser(UUID userId) {
        return delete(new LambdaQueryWrapper<ShopMember>().eq(ShopMember::getUserId, userId));
    }
}
