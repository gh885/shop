package com.shop.platform.inventory.mapper;

import com.shop.platform.inventory.model.Stock;
import com.shop.platform.inventory.model.StockChange;
import com.shop.platform.inventory.model.StockMoveType;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * {@code stock_log} 的只追加写入。
 *
 * <p>幂等键形状 {@code {type}:{refId}:{lineNo}}，带 {@code type} 是因为同一行会先 {@code reserve} 再
 * {@code release}，不带类型就撞。
 *
 * <p>{@link #append} 返回 false 表示这条流水已经记过——它本身就是幂等闸门，调用方据此决定要不要继续。
 */
@Component
public class StockLogStore {

    private static final String INSERT =
            """
            INSERT INTO inventory.stock_log
                (sku_id, warehouse_id, merchant_id, type, quantity,
                 before_available, after_available, before_reserved, after_reserved,
                 before_safety, after_safety, before_on_hand, after_on_hand,
                 ref_type, ref_id, idempotency_key, operator_type, operator_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (idempotency_key) DO NOTHING
            """;

    private final JdbcTemplate jdbc;

    public StockLogStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /**
     * 记一条流水。返回 false = 这个幂等键已经存在，本次是重复请求。
     *
     * <p>{@code quantity} 按类型取：{@code commit} 不动科目列，恒为 0；其余取可售量的变化。
     * 只有一个例外——{@code ship} 可售不动，取实物的减少量（负数）。
     */
    public boolean append(
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
        int inserted = jdbc.update(
                INSERT,
                after.skuId(),
                after.warehouseId(),
                after.merchantId(),
                type.dbValue(),
                quantity,
                before.available(),
                after.available(),
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
                operatorId);
        return inserted == 1;
    }
}
