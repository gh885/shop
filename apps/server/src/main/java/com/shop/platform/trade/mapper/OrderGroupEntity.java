package com.shop.platform.trade.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.PgJsonbTypeHandler;
import com.shop.platform.trade.model.CloseReason;
import com.shop.platform.trade.model.PaymentStatus;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * trade.order_group 行映射。
 *
 * <p>时间列由数据库管：created_at 靠列默认 now()，closed_at / paid_at 只在状态迁移 SQL 里以
 * now() 落值，三个字段对 insert/update 都封闭（{@link FieldStrategy#NEVER}）。状态迁移不经过实体——
 * 全是 {@link OrderGroupMapper} 里带前置条件的 UPDATE，0 行是判决。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@TableName(value = "trade.order_group", autoResultMap = true)
public class OrderGroupEntity {

    /** 应用侧生成（Ids.newId()），不走数据库默认。 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    private String groupNo;
    private UUID buyerId;
    private UUID quoteId;
    private PaymentStatus paymentStatus;
    private String currency;
    private long goodsAmount;
    private long discountAmount;
    private long shippingAmount;
    private long payableAmount;
    private long paidAmount;
    private long refundedAmount;

    @TableField(typeHandler = PgJsonbTypeHandler.class)
    private String shipAddress;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Instant closedAt;

    private CloseReason closeReason;
    private Instant expireAt;
    private String idempotencyKey;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Instant paidAt;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Instant createdAt;
}
