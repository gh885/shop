package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 店铺成员 —— 用户与店铺的多对多关系，卖家身份的载体。
 *
 * <p>一个用户可同时是买家 + 多店铺的成员（account.users 统一账号），「是卖家」= 在此表有记录。店主=role 为 OWNER 的那条，开店时写入；
 * 成员走「店主邀请 → 对方登录同意」两段式：先落 PENDING，对方同意后置 ACTIVE。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName(value = "shop.shop_members", autoResultMap = true)
public class ShopMember {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 所属店铺 ID（shop.shops.id） */
    private UUID shopId;

    /** 成员用户 ID（account.users.id，统一账号）。同店同人唯一，唯一索引 uk_shop_members_shop_user 兜底并发 */
    private UUID userId;

    /** 角色：店主/成员，概念归 {@link MemberRole}。OWNER 只有开店时写入那一条；邀请加入的都是 MEMBER */
    private MemberRole role;

    /** 子账号被授予的权限码（白名单见 shop/service/SellerGrants，默认空集=最小权限）；
     *  OWNER 全权由角色判定不读此列。jsonb 存储，读写经 JsonbStringListHandler */
    @TableField(typeHandler = JsonbStringListHandler.class)
    private java.util.List<String> permissions;

    /** 成员状态：PENDING 邀请待对方同意 / ACTIVE 已生效，概念归 {@link MemberStatus} */
    private MemberStatus status;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
