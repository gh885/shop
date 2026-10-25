package com.shop.platform.inventory.mapper;

import com.shop.platform.inventory.model.Stock;
import com.shop.platform.inventory.model.StockChange;
import com.shop.platform.inventory.model.StockMoveType;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * {@code stock_ledger} 的只追加写入。
 *
 * <p>幂等键形状 {@code {type}:{refId}:{lineNo}}，带 {@code type} 是因为同一行会先 {@code reserve} 再
 * {@code release}，不带类型就撞。
 *
 * <p>{@link #append} 返回 false 表示这条流水已经记过——它本身就是幂等闸门，调用方据此决定要不要继续。
 */
@Mapper
public interface StockLedgerMapper {

    /**
     * 记一条流水。返回 false = 这个幂等键已经存在，本次是重复请求。
     *
     * <p>{@code quantity} 按类型取：{@code commit} 不动科目列，恒为 0；其余取可售量的变化。
     * 只有一个例外——{@code ship} 可售不动，取实物的减少量（负数）。
     */
    default boolean append(
            StockMoveType type,
            StockChange change,
            int quantity,
            String refType,
            UUID refId,
            String idempotencyKey,
            String operatorType,
            UUID operatorId) {
        Stock before = change.before();
        Stock after = change.after();
        return appendRow(new NewLog(
                        after.skuId(),
                        after.warehouseId(),
                        after.merchantId(),
                        type,
                        quantity,
                        before.availableToPromise(),
                        after.availableToPromise(),
                        before.reserved(),
                        after.reserved(),
                        before.safety(),
                        after.safety(),
                        before.onHand(),
                        after.onHand(),
                        refType,
                        refId,
                        idempotencyKey,
                        operatorType,
                        operatorId))
                == 1;
    }

    @Insert(
            """
            INSERT INTO inventory.stock_ledger
                (sku_id, warehouse_id, merchant_id, type, quantity,
                 before_available_to_promise, after_available_to_promise, before_reserved, after_reserved,
                 before_safety, after_safety, before_on_hand, after_on_hand,
                 ref_type, ref_id, idempotency_key, operator_type, operator_id)
            VALUES (#{row.skuId}, #{row.warehouseId}, #{row.merchantId}, #{row.type}, #{row.quantity},
                    #{row.beforeAvailable}, #{row.afterAvailable}, #{row.beforeReserved}, #{row.afterReserved},
                    #{row.beforeSafety}, #{row.afterSafety}, #{row.beforeOnHand}, #{row.afterOnHand},
                    #{row.refType}, #{row.refId}, #{row.idempotencyKey}, #{row.operatorType},
                    #{row.operatorId})
            ON CONFLICT (idempotency_key) DO NOTHING
            """)
    int appendRow(@Param("row") NewLog row);

    /** 落库参数：把 before/after 两个科目快照摊平成一行流水的前后列。 */
    record NewLog(
            UUID skuId,
            UUID warehouseId,
            UUID merchantId,
            StockMoveType type,
            int quantity,
            int beforeAvailable,
            int afterAvailable,
            int beforeReserved,
            int afterReserved,
            int beforeSafety,
            int afterSafety,
            int beforeOnHand,
            int afterOnHand,
            String refType,
            UUID refId,
            String idempotencyKey,
            String operatorType,
            UUID operatorId) {}
}
