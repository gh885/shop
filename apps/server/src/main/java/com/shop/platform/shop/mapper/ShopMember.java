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
 * 店铺成员 —— 用户与店铺的多对多关系，卖家身份的载体。
 *
 * <p>一个用户可同时是买家 + 多店铺的成员（account.users 统一账号），「是卖家」= 在此表有记录。店主=role 为 OWNER 的那条，开店时写入；
 * 成员走「店主邀请 → 对方登录同意」两段式：先落 PENDING，对方同意后置 ACTIVE。
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

    /** 角色：店主/成员，概念归 {@link MemberRole}。OWNER 只有开店时写入那一条；邀请加入的都是 MEMBER */
    private MemberRole role;

    /** 子账号被授予的权限码（默认空集=最小权限）；
     *  OWNER 全权由角色判定不读此列。jsonb 存储，读写经 JacksonTypeHandler */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private java.util.List<String> permissions;

    /** 成员状态：PENDING 邀请待对方同意 / ACTIVE 已生效，概念归 {@link MemberStatus} */
    private MemberStatus status;
}
