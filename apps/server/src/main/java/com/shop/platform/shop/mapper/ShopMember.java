package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 店铺成员行 —— 子账号改造后**只有店主这一种行**（开店时写入，role=OWNER、status=ACTIVE）。
 *
 * <p>它承载两件事：「一人一店」的名额判定（OWNER 行数）与店铺归属/店主闸门。此前那种
 * 「邀请 → 对方确认」的 MEMBER 行已随子账号改造退场：子账号是独立凭证（`account.shop_subaccounts`），
 * 店与它的绑定写在凭证行上，判权码也在那一行上——授权真相一条链，不做两处存两处改。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName(value = "shop.shop_members", autoResultMap = true)
public class ShopMember extends AuditedEntity {

    /** 所属店铺 ID（shop.shops.id） */
    private UUID shopId;

    /** 成员用户 ID（account.users.id，统一账号）。同店同人唯一，唯一索引 uk_shop_members_shop_user 兜底并发 */
    private UUID userId;

    /** 角色：概念归 {@link MemberRole}。今天只有开店时写入的 OWNER 一条（MEMBER 档已无生产者，词表保留是为了历史行读得出） */
    private MemberRole role;

    /** 历史列的遗留字段：权限码已搬到子账号凭证行，OWNER 全权由角色判定；本列今天不再被写入 */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private java.util.List<String> permissions;

    /**
     * 成员状态：本表只剩开店写入的 OWNER 行，且恒为 ACTIVE。
     *
     * <p>列保留（表不物理删、历史行可能仍是旧值），但**今天没有第二个写者**：子账号的停用/启用状态
     * 在 {@code account.shop_subaccounts} 上（{@code SubaccountStatus}），成员表既没有邀请态也没有整行回写路径，
     * 所以实体不带 {@code @TableField(updateStrategy = NEVER)}——那是给「有第二写者、同时又有 updateById 回写」
     * 的列准备的（口径见 docs/conventions/backend-mapper.md）。
     */
    private MemberStatus status;
}
