package com.shop.platform.fulfillment.mapper;

import com.shop.platform.fulfillment.model.PackageStatus;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * {@code package} 与 {@code package_item} 的读写。
 *
 * <p>所有状态迁移都是条件更新：影响 0 行是判决，不是异常。
 */
@Component
public class PackageStore {

    private static final String INSERT =
            """
            INSERT INTO fulfillment.package
                (id, package_no, seller_order_id, merchant_id, carrier_code, tracking_no,
                 status, shipped_at)
            VALUES (?, ?, ?, ?, ?, ?, 'shipped', now())
            """;

    private static final String INSERT_ITEM =
            """
            INSERT INTO fulfillment.package_item (package_id, order_line_id, quantity)
            VALUES (?, ?, ?)
            """;

    private static final String COLUMNS = "id, package_no, seller_order_id, merchant_id, carrier_code, tracking_no, "
            + "status, shipped_at, delivered_at";

    private static final String FIND =
            """
            SELECT %s FROM fulfillment.package WHERE id = ?
            """.formatted(COLUMNS);

    private static final String FIND_BY_NO =
            """
            SELECT %s FROM fulfillment.package WHERE package_no = ?
            """.formatted(COLUMNS);

    private static final String FIND_BY_SELLER_ORDER =
            """
            SELECT %s FROM fulfillment.package WHERE seller_order_id = ? ORDER BY created_at
            """
                    .formatted(COLUMNS);

    /**
     * 签收。前置条件 {@code status NOT IN (终态)} 就是幂等闸门：重放影响 0 行。
     *
     * <p>不写成 {@code status = 'shipped'}：包裹可能已经推进到 {@code in_transit}，
     * 那时签收也必须成立——轨迹回写还没做，但状态机的形状要先对。
     */
    private static final String MARK_DELIVERED =
            """
            UPDATE fulfillment.package
               SET status = 'delivered', delivered_at = now()
             WHERE id = ? AND status NOT IN ('delivered', 'returned', 'cancelled')
            """;

    private static final RowMapper<PackageRow> MAPPER = (rs, row) -> new PackageRow(
            rs.getObject("id", UUID.class),
            rs.getString("package_no"),
            rs.getObject("seller_order_id", UUID.class),
            rs.getObject("merchant_id", UUID.class),
            rs.getString("carrier_code"),
            rs.getString("tracking_no"),
            PackageStatus.from(rs.getString("status")),
            rs.getTimestamp("shipped_at") == null
                    ? null
                    : rs.getTimestamp("shipped_at").toInstant(),
            rs.getTimestamp("delivered_at") == null
                    ? null
                    : rs.getTimestamp("delivered_at").toInstant());

    private final JdbcTemplate jdbc;

    public PackageStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(NewPackage pkg) {
        jdbc.update(
                INSERT,
                pkg.id(),
                pkg.packageNo(),
                pkg.sellerOrderId(),
                pkg.merchantId(),
                pkg.carrierCode(),
                pkg.trackingNo());
    }

    public void insertItem(UUID packageId, UUID orderLineId, int quantity) {
        jdbc.update(INSERT_ITEM, packageId, orderLineId, quantity);
    }

    public Optional<PackageRow> find(UUID packageId) {
        return jdbc.query(FIND, MAPPER, packageId).stream().findFirst();
    }

    public Optional<PackageRow> findByPackageNo(String packageNo) {
        return jdbc.query(FIND_BY_NO, MAPPER, packageNo).stream().findFirst();
    }

    public List<PackageRow> findBySellerOrder(UUID sellerOrderId) {
        return jdbc.query(FIND_BY_SELLER_ORDER, MAPPER, sellerOrderId);
    }

    /** false = 已经是终态，本次跳过。 */
    public boolean markDelivered(UUID packageId) {
        return jdbc.update(MARK_DELIVERED, packageId) == 1;
    }

    /**
     * 包裹里的行。
     *
     * <p><b>不 JOIN {@code trade.order_line}。</b> 跨 schema 不 JOIN 是硬规则，而且那个 JOIN 会把
     * trade 的表结构钉进 fulfillment 的 SQL 里。行号由调用方通过 {@code TradeQuery} 补——
     * 那才是这两个模块之间唯一允许的通道。
     */
    public List<ItemRow> findItems(UUID packageId) {
        return jdbc.query(
                """
                SELECT order_line_id, quantity
                  FROM fulfillment.package_item
                 WHERE package_id = ?
                 ORDER BY order_line_id
                """,
                (rs, row) -> new ItemRow(rs.getObject("order_line_id", UUID.class), rs.getInt("quantity")),
                packageId);
    }

    public record NewPackage(
            UUID id, String packageNo, UUID sellerOrderId, UUID merchantId, String carrierCode, String trackingNo) {}

    public record PackageRow(
            UUID id,
            String packageNo,
            UUID sellerOrderId,
            UUID merchantId,
            String carrierCode,
            String trackingNo,
            PackageStatus status,
            Instant shippedAt,
            Instant deliveredAt) {}

    public record ItemRow(UUID orderLineId, int quantity) {}
}
