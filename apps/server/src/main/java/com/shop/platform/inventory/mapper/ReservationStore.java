package com.shop.platform.inventory.mapper;

import com.shop.platform.inventory.model.ReservationStatus;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * {@code reservation} 的写入与点查。
 *
 * <p>状态推进一律是带前置条件的 UPDATE：影响 0 行不是"没事"，而是当前状态和你以为的不一样。
 * 调用方必须拿 {@link #find} 回查一次当前状态再决定——直接跳过是最容易埋进去的 bug。
 */
@Component
public class ReservationStore {

    private static final RowMapper<Reservation> MAPPER = (rs, row) -> new Reservation(
            rs.getObject("id", UUID.class),
            rs.getObject("sku_id", UUID.class),
            rs.getObject("warehouse_id", UUID.class),
            rs.getObject("merchant_id", UUID.class),
            rs.getObject("order_group_id", UUID.class),
            rs.getObject("seller_order_id", UUID.class),
            rs.getInt("line_no"),
            rs.getInt("quantity"),
            ReservationStatus.from(rs.getString("status")),
            rs.getTimestamp("expires_at").toInstant());

    private static final String COLUMNS =
            "id, sku_id, warehouse_id, merchant_id, order_group_id, seller_order_id, line_no, quantity, status, expires_at";

    private static final String INSERT =
            """
            INSERT INTO inventory.reservation
                (sku_id, warehouse_id, merchant_id, order_group_id, seller_order_id, line_no,
                 quantity, status, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', ?)
            """;

    private static final String FIND =
            """
            SELECT %s FROM inventory.reservation WHERE id = ?
            """.formatted(COLUMNS);

    private static final String FIND_BY_LINE =
            """
            SELECT %s FROM inventory.reservation WHERE seller_order_id = ? AND line_no = ?
            """
                    .formatted(COLUMNS);

    private static final String ADVANCE =
            """
            UPDATE inventory.reservation SET status = ?
             WHERE id = ? AND status = ?
            """;

    /** 超时兜底：只捞还挂着且已过期的，每批限量。 */
    private static final String FIND_EXPIRED =
            """
            SELECT %s FROM inventory.reservation
             WHERE status = 'reserved' AND expires_at < now()
             ORDER BY expires_at
             LIMIT ?
            """
                    .formatted(COLUMNS);

    private final JdbcTemplate jdbc;

    public ReservationStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 撞 {@code uq_reservation_line} 说明这一行已经预占过，调用方要处理重复下单。 */
    public void insert(Reservation row) {
        jdbc.update(
                INSERT,
                row.skuId(),
                row.warehouseId(),
                row.merchantId(),
                row.orderGroupId(),
                row.sellerOrderId(),
                row.lineNo(),
                row.quantity(),
                java.sql.Timestamp.from(row.expiresAt()));
    }

    public Optional<Reservation> find(UUID id) {
        return jdbc.query(FIND, MAPPER, id).stream().findFirst();
    }

    public Optional<Reservation> findByLine(UUID sellerOrderId, int lineNo) {
        return jdbc.query(FIND_BY_LINE, MAPPER, sellerOrderId, lineNo).stream().findFirst();
    }

    /** false = 当前状态不是 {@code from}，别人先改了。 */
    public boolean advance(UUID id, ReservationStatus from, ReservationStatus to) {
        return jdbc.update(ADVANCE, to.dbValue(), id, from.dbValue()) == 1;
    }

    public List<Reservation> findExpired(int limit) {
        return jdbc.query(FIND_EXPIRED, MAPPER, limit);
    }

    public record Reservation(
            UUID id,
            UUID skuId,
            UUID warehouseId,
            UUID merchantId,
            UUID orderGroupId,
            UUID sellerOrderId,
            int lineNo,
            int quantity,
            ReservationStatus status,
            Instant expiresAt) {

        /** 待落库的一条：{@code id} 交给库生成，此时还没有状态。 */
        public static Reservation pending(
                UUID skuId,
                UUID warehouseId,
                UUID merchantId,
                UUID orderGroupId,
                UUID sellerOrderId,
                int lineNo,
                int quantity,
                Instant expiresAt) {
            return new Reservation(
                    null,
                    skuId,
                    warehouseId,
                    merchantId,
                    orderGroupId,
                    sellerOrderId,
                    lineNo,
                    quantity,
                    ReservationStatus.RESERVED,
                    expiresAt);
        }
    }
}
