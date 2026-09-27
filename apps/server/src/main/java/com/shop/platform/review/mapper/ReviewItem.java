package com.shop.platform.review.mapper;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.shop.platform.infra.db.BaseEntity;
import java.util.List;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 评价行 —— 一个订单行一份评分（星级 + 文字 + 图）。
 *
 * <p>商品与店铺信息不在这里：名称/图是下单快照（与 orders.items 同一份），店铺归属从评价主体带过来。
 * 追加只追加这一列也不允许——行随主体一次性写入（REV-02）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName(value = "review.review_items", autoResultMap = true)
public class ReviewItem extends BaseEntity {

    /** 所属评价 review.reviews.id（同 schema，应用层保证一致） */
    private UUID reviewId;

    /** 被评的订单行 orders.items.id；唯一索引钉死同一行只被评一次 */
    private UUID orderItemId;

    /** 被评商品 product.products.id，裸引用（商详按它聚合） */
    private UUID productId;

    /** 被评 SKU product.skus.id */
    private UUID skuId;

    /** 商品名快照（与 orders.items.name 同宽；商品改名不影响历史评价） */
    private String name;

    /** 商品图快照，与下单同源（SPU 主图回落口径在 order 侧算好） */
    private String image;

    /** 星级 1~5，DB CHECK 同词表 */
    private Integer rating;

    /** 文字，可空（只打星也算一次评价） */
    private String content;

    /** 图片对象存储 key 数组（存 key 不存 URL，REV-07） */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> images;
}
