package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.shop.platform.account.api.SubaccountStatus;
import com.shop.platform.infra.db.AuditedEntity;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 卖家子账号 —— 第三种认证主体（kind=sub）的凭证行：登录名 + 口令 + 绑定手机号 + 所属店铺 + 被授予权限码。
 *
 * <p>与买家（{@code account.users}，手机号即身份）和平台员工（{@code account.staff}，工号 + 口令）并列：
 * 子账号是<b>工作身份</b>，用自己的登录名登录卖家工作台，不认买家端的任何入口。
 *
 * <p>{@code shopId} 是自带归属（不是可选的上下文）：登录后即确定工作店铺，不需要也不允许客户端指定。
 * 跨 schema 只存值，不 JOIN。
 *
 * <p>状态列有两个写者（激活条件转移 / 停启用条件更新），因此本实体<b>不提供</b>整行回写路径，
 * 一律走 {@link ShopSubaccountMapper} 里把守卫写死在 WHERE 的条件更新。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName(value = "account.shop_subaccounts", autoResultMap = true)
public class ShopSubaccount extends AuditedEntity {

    /** 所属店铺（shop.shops.id）。自带归属：登录后工作店铺即它，不吃 X-Shop-Id */
    private UUID shopId;

    /** 登录名，全局唯一（唯一索引 uk_shop_subaccounts_login_name 兜底并发）。刻意不拼店名——店名可改 */
    private String loginName;

    /** 口令哈希（BCrypt）。初始口令由店主建号时设置，员工激活后可自行更换 */
    private String passwordHash;

    /** 绑定手机号：激活时短信验证的就是它，也是「同店一号一账号」的唯一键 */
    private String phone;

    /** 状态（三档，见 {@link SubaccountStatus}）。写入口只有 mapper 的条件更新 */
    private SubaccountStatus status;

    /** 被授予的权限码（jsonb，默认空集）。店主通配不落此列 */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> permissions;

    /**
     * 手机号验证通过时刻 —— 追责锚点（「这条号在何时被证明是本人的」）。
     *
     * <p>回写永不带这一列：它只由激活那一笔条件更新写一次，之后不再变（停用/启用/改权都不该动它）。
     */
    @TableField(updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime verifiedAt;

    /** 本行是否可用作登录主体：状态 ACTIVE */
    public boolean isActive() {
        return status != null && status.isActive();
    }
}
