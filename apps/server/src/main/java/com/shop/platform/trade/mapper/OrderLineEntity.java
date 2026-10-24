package com.shop.platform.trade.mapper;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.PgJsonbTypeHandler;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * trade.order_line 行映射。
 *
 * <p>快照列（title / spec_values / 金额等）只插不改；计数器列（shipped_qty 等）只走
 * {@link OrderLineMapper} 里带上限条件的更新，实体不背写语义。插入时计数器写 0，
 * 与列默认一致。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@TableName(value = "trade.order_line", autoResultMap = true)
public class OrderLineEntity {

    /** 应用侧生成（Ids.newId()），不走数据库默认。 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    private UUID sellerOrderId;
    private int lineNo;
    private UUID offerId;
    private UUID skuId;
    private UUID spuId;
    private String currency;
    private int quantity;
    private long unitAmount;
    private long subtotal;
    private long discountAmount;
    private long payable;
    private int shippedQty;
    private int receivedQty;
    private int refundedQty;
    private long refundedAmount;
    private int cancelledQty;
    private long cancelledSubtotal;
    private long cancelledDiscount;
    private long cancelledAmount;
    private String title;
    private String imageUrl;

    @TableField(typeHandler = PgJsonbTypeHandler.class)
    private String specValues;

    private UUID categoryId;
    private UUID brandId;
    private String identityKey;
    private int commissionRateBp;
    private String rateVersion;
}
