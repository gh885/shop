package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 发货单行 —— 一张包裹里装了哪个订单行的多少件。
 *
 * <p>发货粒度从「整单」下到「订单行 + 数量」：同一行可以分多次、多张发货单发出，
 * 累计有效发货量由订单行的 {@code shipped_quantity} 回答（docs/domain/order-model.md §4.4）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("logistics.shipment_lines")
public class ShipmentLine extends BaseEntity {

    /** 所属发货单，logistics.shipments.id */
    private UUID shipmentId;

    /** 订单行，orders.items.id，跨 schema 裸引用不加 FK */
    private UUID orderItemId;

    /** 本次发出的件数，> 0 */
    private Integer quantity;
}
