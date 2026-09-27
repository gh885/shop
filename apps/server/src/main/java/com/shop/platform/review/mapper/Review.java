package com.shop.platform.review.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 评价主体（一单一评，append-only）。
 *
 * <p>追评与回复挂在主体上而不是各一张表：两者各只允许一次（REV-09 / REV-10），
 * 用可空列表达比多两张表少两次一致性问题。
 * 主体行的 updated_at 只在追评/回复落库时变动，正文与评分永不改写（REV-01）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("review.reviews")
public class Review extends AuditedEntity {

    /** 被评订单 orders.orders.id；唯一索引钉死一单一条 */
    private UUID orderId;

    /** 评价人 = 订单归属买家 account.users.id */
    private UUID userId;

    /** 被评店铺 shop.shops.id（订单本身即单店单） */
    private UUID shopId;

    /** 追评正文（一次，可空；纯文字） */
    private String appendText;

    /** 追评时刻 */
    private OffsetDateTime appendedAt;

    /** 卖家回复正文（一次，可空） */
    private String reply;

    /** 回复的店铺成员 user id（留痕，不进买家可见内容） */
    private UUID replyBy;

    /** 回复时刻 */
    private OffsetDateTime repliedAt;
}
