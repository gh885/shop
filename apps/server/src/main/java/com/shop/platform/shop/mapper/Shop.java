package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.shop.model.ShopStatus;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 店铺 —— 卖家侧的业务单元，商品的归属（product.products.shop_id）。
 *
 * <p>店主=主账号（owner_id，account.users.id），店铺成员见 shop_members。店铺状态由平台审核驱动：开店先落 PENDING_REVIEW，平台审核通过才
 * ACTIVE（审核记录在本模块 shop_reviews，审批同事务推进状态），店主才能用它经营。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("shop.shops")
public class Shop extends AuditedEntity {

    /** 店主（主账号）ID。与 shop_members 里 role=OWNER 的那条冗余并存，开店时原子写入；授权判断以 shop_members 为准 */
    private UUID ownerId;

    /** 店名 */
    private String name;

    /** 店铺 logo 的 key（对象存储 key，非完整 URL，与 user.avatar_key 同风格），可空 */
    private String logoKey;

    /** 店铺状态：PENDING_REVIEW 待审核 / ACTIVE 正常 / REJECTED 拒绝 / DISABLED 封禁；概念归 {@link ShopStatus}；不做物理删除 */
    private ShopStatus status;

    /** 是否正常营业态（下单/上架等业务闸门） */
    public boolean isActive() {
        return status != null && status.isActive();
    }
}
