package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.account.api.SubaccountStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

/**
 * 子账号凭证访问。状态列（激活 / 停用 / 启用）有三个写者，一律用把守卫写死在 WHERE 里的条件更新：
 * 「读出来看看再整行写回」与并发的停用/激活相撞时会把刚落的态覆盖回去（口径同 docs/adr/0001）。
 */
@Mapper
public interface ShopSubaccountMapper extends BaseMapper<ShopSubaccount> {

    /** 登录名点查（登录入口；全局唯一） */
    default ShopSubaccount selectByLoginName(String loginName) {
        return selectOne(new LambdaQueryWrapper<ShopSubaccount>().eq(ShopSubaccount::getLoginName, loginName));
    }

    /** 登录名是否已被占用（建号预检；并发由 uk_shop_subaccounts_login_name 兜底） */
    default boolean existsByLoginName(String loginName) {
        return selectCount(new LambdaQueryWrapper<ShopSubaccount>().eq(ShopSubaccount::getLoginName, loginName)) > 0;
    }

    /** 同店同号是否已有子账号（建号预检；并发由 uk_shop_subaccounts_shop_phone 兜底） */
    default boolean existsByShopAndPhone(UUID shopId, String phone) {
        return selectCount(new LambdaQueryWrapper<ShopSubaccount>()
                        .eq(ShopSubaccount::getShopId, shopId)
                        .eq(ShopSubaccount::getPhone, phone))
                > 0;
    }

    /** 某个 id 且属于某店的行（店主管理动作的归属门：别店的行与不存在的行同为 404） */
    default ShopSubaccount selectByIdAndShop(UUID id, UUID shopId) {
        return selectOne(new LambdaQueryWrapper<ShopSubaccount>()
                .eq(ShopSubaccount::getId, id)
                .eq(ShopSubaccount::getShopId, shopId));
    }

    /** 本店全部子账号，先建号的在前（管理页列表） */
    default List<ShopSubaccount> selectByShop(UUID shopId) {
        return selectList(new LambdaQueryWrapper<ShopSubaccount>()
                .eq(ShopSubaccount::getShopId, shopId)
                .orderByAsc(ShopSubaccount::getCreatedAt));
    }

    /**
     * 激活：待激活 → 已激活，并落手机号验证时刻。守卫 {@code status = PENDING_ACTIVATION} 写死在 WHERE——
     * 重复提交激活、或与店主的停用相撞时，只有一个抢得到（0 行即调用方给 409）。
     *
     * @return 影响行数（1=激活成功）
     */
    default int activate(UUID id, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<ShopSubaccount>()
                        .eq(ShopSubaccount::getId, id)
                        .eq(ShopSubaccount::getStatus, SubaccountStatus.PENDING_ACTIVATION)
                        .set(ShopSubaccount::getStatus, SubaccountStatus.ACTIVE)
                        .set(ShopSubaccount::getVerifiedAt, now)
                        .set(ShopSubaccount::getUpdatedAt, now));
    }

    /** 停用：只推 ACTIVE 行（未激活的行本来就用不了）。重复停用影响 0 行 → 调用方给 409 */
    default int disable(UUID id, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<ShopSubaccount>()
                        .eq(ShopSubaccount::getId, id)
                        .eq(ShopSubaccount::getStatus, SubaccountStatus.ACTIVE)
                        .set(ShopSubaccount::getStatus, SubaccountStatus.DISABLED)
                        .set(ShopSubaccount::getUpdatedAt, now));
    }

    /**
     * 启用（解冻）：只推 DISABLED 行。目标态取决于这行有没有验过号——
     * 验过的回 ACTIVE，从没激活过的回 PENDING_ACTIVATION（不能让「启用」变成一条绕过手机验证的后门）。
     *
     * <p>{@code verified} 由调用方按读到的行给出，且同时是 WHERE 条件：读与写之间该行的验号状态若变了，
     * 影响 0 行，不会把一行没验过号的数据推成 ACTIVE（那条路会撞 ck_shop_subaccounts_activation）。
     */
    default int enable(UUID id, boolean verified, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<ShopSubaccount>()
                        .eq(ShopSubaccount::getId, id)
                        .eq(ShopSubaccount::getStatus, SubaccountStatus.DISABLED)
                        .isNull(!verified, ShopSubaccount::getVerifiedAt)
                        .isNotNull(verified, ShopSubaccount::getVerifiedAt)
                        .set(
                                ShopSubaccount::getStatus,
                                verified ? SubaccountStatus.ACTIVE : SubaccountStatus.PENDING_ACTIVATION)
                        .set(ShopSubaccount::getUpdatedAt, now));
    }

    /**
     * 全量替换被授予的权限码。条件更新而非整行回写：与并发的停用相撞时不会把 DISABLED 覆盖回 ACTIVE。
     *
     * @return 影响行数（0 = 行已不存在）
     */
    default int updatePermissions(UUID id, List<String> permissions, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<ShopSubaccount>()
                        .eq(ShopSubaccount::getId, id)
                        .set(ShopSubaccount::getPermissions, permissions)
                        .set(ShopSubaccount::getUpdatedAt, now));
    }

    /** 换口令（店主重置 / 员工激活后自查改）：只写哈希一列 */
    default int updatePasswordHash(UUID id, String passwordHash, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<ShopSubaccount>()
                        .eq(ShopSubaccount::getId, id)
                        .set(ShopSubaccount::getPasswordHash, passwordHash)
                        .set(ShopSubaccount::getUpdatedAt, now));
    }
}
