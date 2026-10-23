package com.shop.platform.inventory.mapper;

import com.shop.platform.infra.db.RowMappers;
import com.shop.platform.inventory.model.ReservationStatus;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * {@code reservation} 的写入与点查。
 *
 * <p>状态推进一律是带前置条件的 UPDATE：影响 0 行不是"没事"，而是当前状态和你以为的不一样。
 * 调用方必须拿 {@link #find} 回查一次当前状态再决定——直接跳过是最容易埋进去的 bug。
 */
@Component
public class ReservationStore {

    private static final String COLUMNS =
            "id, sku_id, warehouse_id, merchant_id, order_group_id, seller_order_id, line_no, quantity, status, expires_at";

    private static final String INSERT =
            """
            INSERT INTO inventory.reservation
                (sku_id, warehouse_id, merchant_id, order_group_id, seller_order_id, line_no,
                 quantity, status, expires_at)
            VALUES (:sku, :wh, :merchant, :group, :sellerOrder, :lineNo, :quantity, 'reserved', :expiresAt)
            """;

    private static final String FIND =
            """
            SELECT %s FROM inventory.reservation WHERE id = :id
            """.formatted(COLUMNS);

    private static final String FIND_BY_LINE =
            """
            SELECT %s FROM inventory.reservation WHERE seller_order_id = :sellerOrder AND line_no = :lineNo
            """
                    .formatted(COLUMNS);

    /** 一批子单的全部预占。整单 commit/release 用它一次取回，省掉逐行点查。 */
    private static final String FIND_BY_SELLER_ORDERS =
            """
            SELECT %s FROM inventory.reservation WHERE seller_order_id IN (:sellerOrderIds)
            """
                    .formatted(COLUMNS);

    private static final String ADVANCE =
            """
            UPDATE inventory.reservation SET status = :to
             WHERE id = :id AND status = :from
            """;

    /** 超时兜底：只捞还挂着且已过期的，每批限量。 */
    private static final String FIND_EXPIRED =
            """
            SELECT %s FROM inventory.reservation
             WHERE status = 'reserved' AND expires_at < now()
             ORDER BY expires_at
             LIMIT :limit
            """
                    .formatted(COLUMNS);

    private static final RowMapper<Reservation> MAPPER = RowMappers.of(Reservation.class);

    private final JdbcClient jdbc;

    public ReservationStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 撞 {@code uq_reservation_line} 说明这一行已经预占过，调用方要处理重复下单。 */
    public void insert(Reservation row) {
        jdbc.sql(INSERT)
                .param("sku", row.skuId())
                .param("wh", row.warehouseId())
                .param("merchant", row.merchantId())
                .param("group", row.orderGroupId())
                .param("sellerOrder", row.sellerOrderId())
                .param("lineNo", row.lineNo())
                .param("quantity", row.quantity())
                .param("expiresAt", RowMappers.toDb(row.expiresAt()))
                .update();
    }

    public Optional<Reservation> find(UUID id) {
        return jdbc.sql(FIND).param("id", id).query(MAPPER).optional();
    }

    public Optional<Reservation> findByLine(UUID sellerOrderId, int lineNo) {
        return jdbc.sql(FIND_BY_LINE)
                .param("sellerOrder", sellerOrderId)
                .param("lineNo", lineNo)
                .query(MAPPER)
                .optional();
    }

    /** 一批子单的全部预占。整单 commit/release 用它一次取回，省掉逐行点查。 */
    public List<Reservation> findBySellerOrders(List<UUID> sellerOrderIds) {
        return jdbc.sql(FIND_BY_SELLER_ORDERS)
                .param("sellerOrderIds", sellerOrderIds)
                .query(MAPPER)
                .list();
    }

    /** false = 当前状态不是 {@code from}，别人先改了。 */
    public boolean advance(UUID id, ReservationStatus from, ReservationStatus to) {
        return jdbc.sql(ADVANCE)
                        .param("to", to.dbValue())
                        .param("id", id)
                        .param("from", from.dbValue())
                        .update()
                == 1;
    }

    public List<Reservation> findExpired(int limit) {
        return jdbc.sql(FIND_EXPIRED).param("limit", limit).query(MAPPER).list();
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
