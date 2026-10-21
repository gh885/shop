package com.shop.platform.inventory.mapper;

import com.shop.platform.inventory.model.Stock;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * {@code stock} 的全部写入。
 *
 * <p>这里没有任何"先查再改"：三个变动方法都是单条条件 UPDATE + {@code RETURNING}，影响 0 行就是前置条件不成立，
 * 由调用方决定抛异常还是回滚。查和改之间的窗口就是超卖，一条 SQL 把它关掉。
 *
 * <p>{@code RETURNING} 只给改后的值。改前的值由操作语义反推（扣 n 件之前就是多 n 件），
 * 不要为了拿 before 再查一次——那会引入新的竞态。
 */
@Component
public class StockStore {

    private static final String COLUMNS = "merchant_id, on_hand, available, reserved, safety";

    private static final String FIND =
            """
            SELECT %s FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?
            """
                    .formatted(COLUMNS);

    private static final String LOCK =
            """
            SELECT %s FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ? FOR UPDATE
            """
                    .formatted(COLUMNS);

    private static final String INSERT =
            """
            INSERT INTO inventory.stock
                (sku_id, warehouse_id, merchant_id, on_hand, available, reserved, safety)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            RETURNING %s
            """
                    .formatted(COLUMNS);

    /** 下单预占：可售减、预占加。{@code available >= n} 就是"够不够卖"的唯一判据。 */
    private static final String RESERVE =
            """
            UPDATE inventory.stock
               SET available = available - ?,
                   reserved  = reserved + ?,
                   updated_at = now()
             WHERE sku_id = ? AND warehouse_id = ? AND available >= ?
            RETURNING %s
            """
                    .formatted(COLUMNS);

    /** 释放：预占减、可售加。{@code reserved >= n} 挡住重复释放。 */
    private static final String RELEASE =
            """
            UPDATE inventory.stock
               SET available = available + ?,
                   reserved  = reserved - ?,
                   updated_at = now()
             WHERE sku_id = ? AND warehouse_id = ? AND reserved >= ?
            RETURNING %s
            """
                    .formatted(COLUMNS);

    /** 出库：预占减、实物减，可售不动——"还能卖几件"在预占那一刻就减过了。 */
    private static final String SHIP =
            """
            UPDATE inventory.stock
               SET reserved = reserved - ?,
                   on_hand  = on_hand - ?,
                   updated_at = now()
             WHERE sku_id = ? AND warehouse_id = ? AND reserved >= ? AND on_hand >= ?
            RETURNING %s
            """
                    .formatted(COLUMNS);

    /** 商家调整：改实物与安全库存，可售由守恒式反推。这是唯一允许覆盖数字的入口。 */
    private static final String ADJUST =
            """
            UPDATE inventory.stock
               SET on_hand   = ?,
                   safety    = ?,
                   available = ? - reserved - ?,
                   updated_at = now()
             WHERE sku_id = ? AND warehouse_id = ?
            RETURNING %s
            """
                    .formatted(COLUMNS);

    private final JdbcTemplate jdbc;

    public StockStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<Stock> find(UUID skuId, UUID warehouseId) {
        return jdbc.query(FIND, mapTo(skuId, warehouseId), skuId, warehouseId).stream()
                .findFirst();
    }

    /**
     * 锁住这一行再读。
     *
     * <p>只有 {@code adjust} 用它：它要拿改前的值写流水。调整是商家低频动作，没有超卖风险；
     * 下单路径永远不许用这个。
     */
    public Optional<Stock> lock(UUID skuId, UUID warehouseId) {
        return jdbc.query(LOCK, mapTo(skuId, warehouseId), skuId, warehouseId).stream()
                .findFirst();
    }

    /** 首次建档。已有行就撞主键，调用方必须先 {@link #lock}。 */
    public Stock insert(Stock stock) {
        return Objects.requireNonNull(jdbc.queryForObject(
                INSERT,
                mapTo(stock.skuId(), stock.warehouseId()),
                stock.skuId(),
                stock.warehouseId(),
                stock.merchantId(),
                stock.onHand(),
                stock.available(),
                stock.safety()));
    }

    /**
     * 覆盖实物与安全库存，可售由守恒式反推：{@code available = on_hand - reserved - safety}。
     *
     * <p>反推而不是让调用方传 {@code available}：传两个数就有两个数对不上的可能，反推只有一个真相。
     */
    public Stock adjust(UUID skuId, UUID warehouseId, int onHand, int safety) {
        return Objects.requireNonNull(jdbc.queryForObject(
                ADJUST, mapTo(skuId, warehouseId), onHand, safety, onHand, safety, skuId, warehouseId));
    }

    /** 空 = 可售不够。调用方抛 {@code INSUFFICIENT_STOCK}，让整个下单事务回滚。 */
    public Optional<Stock> reserve(UUID skuId, UUID warehouseId, int quantity) {
        return jdbc.query(RESERVE, mapTo(skuId, warehouseId), quantity, quantity, skuId, warehouseId, quantity).stream()
                .findFirst();
    }

    /** 空 = 预占不足（已经被释放或出库过）。调用方必须当账不对，不能当成"已处理"。 */
    public Optional<Stock> release(UUID skuId, UUID warehouseId, int quantity) {
        return jdbc.query(RELEASE, mapTo(skuId, warehouseId), quantity, quantity, skuId, warehouseId, quantity).stream()
                .findFirst();
    }

    /** 空 = 预占或实物不足，说明账已经不对了。 */
    public Optional<Stock> ship(UUID skuId, UUID warehouseId, int quantity) {
        return jdbc
                .query(SHIP, mapTo(skuId, warehouseId), quantity, quantity, skuId, warehouseId, quantity, quantity)
                .stream()
                .findFirst();
    }

    private static RowMapper<Stock> mapTo(UUID skuId, UUID warehouseId) {
        return (rs, row) -> new Stock(
                skuId,
                warehouseId,
                rs.getObject("merchant_id", UUID.class),
                rs.getInt("on_hand"),
                rs.getInt("available"),
                rs.getInt("reserved"),
                rs.getInt("safety"));
    }
}
