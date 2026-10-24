package com.shop.platform.trade.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.PgJsonbTypeHandler;
import com.shop.platform.trade.model.CloseReason;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * trade.seller_order 行映射。
 *
 * <p>fulfillment_status 不由实体写入：它是从行计数器重算出来的（见 {@link SellerOrderMapper}
 * 的 recomputeFulfillment），手动 set 就是第二处真相。closed_at / created_at 由数据库管，
 * 对 insert/update 都封闭（{@link FieldStrategy#NEVER}）。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@TableName(value = "trade.seller_order", autoResultMap = true)
public class SellerOrderEntity {

    /** 应用侧生成（Ids.newId()），不走数据库默认。 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    private String orderNo;
    private UUID groupId;
    private UUID merchantId;
    private UUID shopId;
    private String currency;
    private long goodsAmount;
    private long discountAmount;
    private long shippingAmount;
    private long payableAmount;
    private String fulfillmentStatus;
    private CloseReason closedReason;

    @TableField(typeHandler = PgJsonbTypeHandler.class)
    private String shipAddress;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Instant closedAt;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Instant createdAt;
}
