package com.shop.platform.favorite.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 收藏条目 —— 买家对商品（SPU 级）的收藏标记，营销/留存数据。
 *
 * <p>纯追加删除表：取消收藏 = DELETE，行永远不被 UPDATE，故无 updated_at。
 * 同用户同商品唯一（uk_favorite_items_user_product），收藏是幂等开关不是计数器；
 * 商品展示字段（现价/主图）不落库，读取时跨 schema 按 ID 只读批查拼装——
 * 收藏夹要能看见「降价了」，存快照就瞎了。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("favorite.items")
public class FavoriteItem extends BaseEntity {

    /** 归属买家（account.users.id），跨 schema 裸引用不加 FK */
    private UUID userId;

    /** 被收藏的商品（product.products.id，SPU 级），跨 schema 裸引用不加 FK */
    private UUID productId;
}
