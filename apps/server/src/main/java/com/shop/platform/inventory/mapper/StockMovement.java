package com.shop.platform.inventory.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 库存流水 —— append-only 账本，每条库存变更一行，可重放对账。
 *
 * <p>只插不改（无 updated_at）：撤销/回补用新行（RELEASE）表达，绝不动已写行。
 * 完整视点：既记总库存前后（before/after_stock）也记可用量前后（before/after_available）。
 * <ul>
 *   <li>quantity = 总库存增量（after_stock - before_stock），带符号（正 = 总库存/可卖量增加）
 *   <li>对账口径：Σ(quantity) = 当前总库存相对初始态的净变化；Σ(after_available - before_available) = 可用量净变化
 * </ul>
 * 口径约束：FREEZE 与 RELEASE 只换冻结/可用归属不动总存量（quantity=0）；CAPTURE 扣实总库存 -n；
 * RESTOCK 后台补货总库存 +n；RETURN 已付款取消回补总库存 +n（订单驱动，orderId 必有）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("inventory.stock_movements")
public class StockMovement extends BaseEntity {

    /** 流水类型 */
    public static final String TYPE_FREEZE = "FREEZE";

    public static final String TYPE_CAPTURE = "CAPTURE";

    public static final String TYPE_RELEASE = "RELEASE";

    public static final String TYPE_RESTOCK = "RESTOCK";

    /** 已付款订单取消/退款回补：CAPTURE 已扣实的货退回可卖池，总库存 +n，orderId 必有 */
    public static final String TYPE_RETURN = "RETURN";

    /** 归属 SKU ID，product.skus.id，裸引用 */
    private UUID skuId;

    /** 关联订单 ID，orders.orders.id；冻结/扣实/释放/回补必有，后台补货为 NULL */
    private UUID orderId;

    /** 类型：FREEZE / CAPTURE / RELEASE / RESTOCK / RETURN */
    private String type;

    /** 本次总库存增量（after_stock - before_stock，带符号） */
    private Integer quantity;

    /** 操作前总库存（stock） */
    private Integer beforeStock;

    /** 操作后总库存（stock） */
    private Integer afterStock;

    /** 操作前可用量 */
    private Integer beforeAvailable;

    /** 操作后可用量 */
    private Integer afterAvailable;
}
