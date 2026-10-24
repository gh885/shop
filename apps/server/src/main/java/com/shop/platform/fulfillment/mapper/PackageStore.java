package com.shop.platform.fulfillment.mapper;

import com.shop.platform.fulfillment.model.PackageStatus;
import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
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
            VALUES (:id, :packageNo, :sellerOrderId, :merchantId, :carrierCode, :trackingNo,
                    'shipped', now())
            """;

    private static final String INSERT_ITEM =
            """
            INSERT INTO fulfillment.package_item (package_id, order_line_id, quantity)
            VALUES (:packageId, :orderLineId, :quantity)
            """;

    private static final String COLUMNS = "id, package_no, seller_order_id, merchant_id, carrier_code, tracking_no, "
            + "status, shipped_at, delivered_at, delivered_source";

    private static final String FIND =
            """
            SELECT %s FROM fulfillment.package WHERE id = :id
            """.formatted(COLUMNS);

    private static final String FIND_BY_NO =
            """
            SELECT %s FROM fulfillment.package WHERE package_no = :packageNo
            """
                    .formatted(COLUMNS);

    private static final String FIND_BY_SELLER_ORDER =
            """
            SELECT %s FROM fulfillment.package WHERE seller_order_id = :sellerOrderId ORDER BY created_at
            """
                    .formatted(COLUMNS);

    /** webhook 侧按 (承运商, 运单号) 定位包裹。走 uq_package_tracking 这把唯一索引。 */
    private static final String FIND_BY_TRACKING =
            """
            SELECT %s FROM fulfillment.package WHERE carrier_code = :carrierCode AND tracking_no = :trackingNo
            """
                    .formatted(COLUMNS);

    /**
     * 轨迹推进到运输中。前置条件 {@code status = 'shipped'} 就是单调性：
     * 已是 in_transit / 终态的包裹影响 0 行，一条迟到的"揽收"退不回去。
     */
    private static final String MARK_IN_TRANSIT =
            """
            UPDATE fulfillment.package
               SET status = 'in_transit'
             WHERE id = :id AND status = 'shipped'
            """;

    /** 拒收/退回。终态之一，与 delivered 一样由前置条件挡重放。 */
    private static final String MARK_RETURNED =
            """
            UPDATE fulfillment.package
               SET status = 'returned'
             WHERE id = :id AND status NOT IN ('delivered', 'returned', 'cancelled')
            """;

    /** 记录轨迹时间。取 GREATEST：乱序到达的旧轨迹不能把 last_track_at 拨回去。 */
    private static final String TOUCH_TRACK_AT =
            """
            UPDATE fulfillment.package
               SET last_track_at = GREATEST(COALESCE(last_track_at, :occurredAt), :occurredAt)
             WHERE id = :id
            """;

    /**
     * 签收。前置条件 {@code status NOT IN (终态)} 就是幂等闸门：重放影响 0 行。
     *
     * <p>不写成 {@code status = 'shipped'}：包裹可能已经推进到 {@code in_transit}，
     * 那时签收也必须成立——轨迹回写还没做，但状态机的形状要先对。
     *
     * @param source 谁确认的：buyer（买家手点）或 system（到期自动确认），争议时靠它
     */
    private static final String MARK_DELIVERED =
            """
            UPDATE fulfillment.package
               SET status = 'delivered', delivered_at = now(), delivered_source = :source
             WHERE id = :id AND status NOT IN ('delivered', 'returned', 'cancelled')
            """;

    /**
     * 自动确认收货的扫描面：发货后过了宽限还没签收的包裹。
     * 状态驱动——错过一轮的包裹还在这个扫描面里，下一轮照扫，不需要队列兜底。
     */
    private static final String FIND_AUTO_RECEIVABLE =
            """
            SELECT %s FROM fulfillment.package
             WHERE status IN ('shipped', 'in_transit') AND shipped_at < :olderThan
             ORDER BY shipped_at
             LIMIT :limit
            """
                    .formatted(COLUMNS);

    /**
     * 包裹里的行。
     *
     * <p><b>不 JOIN {@code trade.order_line}。</b> 跨 schema 不 JOIN 是硬规则，而且那个 JOIN 会把
     * trade 的表结构钉进 fulfillment 的 SQL 里。行号由调用方通过 {@code TradeQuery} 补——
     * 那才是这两个模块之间唯一允许的通道。
     */
    private static final String FIND_ITEMS =
            """
            SELECT order_line_id, quantity
              FROM fulfillment.package_item
             WHERE package_id = :packageId
             ORDER BY order_line_id
            """;

    private static final RowMapper<PackageRow> MAPPER = RowMappers.of(PackageRow.class);

    private static final RowMapper<ItemRow> ITEM_MAPPER = RowMappers.of(ItemRow.class);

    private final JdbcClient jdbc;

    public PackageStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(NewPackage pkg) {
        jdbc.sql(INSERT)
                .param("id", pkg.id())
                .param("packageNo", pkg.packageNo())
                .param("sellerOrderId", pkg.sellerOrderId())
                .param("merchantId", pkg.merchantId())
                .param("carrierCode", pkg.carrierCode())
                .param("trackingNo", pkg.trackingNo())
                .update();
    }

    public void insertItem(UUID packageId, UUID orderLineId, int quantity) {
        jdbc.sql(INSERT_ITEM)
                .param("packageId", packageId)
                .param("orderLineId", orderLineId)
                .param("quantity", quantity)
                .update();
    }

    public Optional<PackageRow> find(UUID packageId) {
        return jdbc.sql(FIND).param("id", packageId).query(MAPPER).optional();
    }

    public Optional<PackageRow> findByPackageNo(String packageNo) {
        return jdbc.sql(FIND_BY_NO).param("packageNo", packageNo).query(MAPPER).optional();
    }

    public List<PackageRow> findBySellerOrder(UUID sellerOrderId) {
        return jdbc.sql(FIND_BY_SELLER_ORDER)
                .param("sellerOrderId", sellerOrderId)
                .query(MAPPER)
                .list();
    }

    /** false = 已经是终态，本次跳过。 */
    public boolean markDelivered(UUID packageId, String source) {
        return jdbc.sql(MARK_DELIVERED)
                        .param("id", packageId)
                        .param("source", source)
                        .update()
                == 1;
    }

    public List<PackageRow> findAutoReceivable(Instant olderThan, int limit) {
        return jdbc.sql(FIND_AUTO_RECEIVABLE)
                .param("olderThan", RowMappers.toDb(olderThan))
                .param("limit", limit)
                .query(MAPPER)
                .list();
    }

    public Optional<PackageRow> findByTrackingNo(String carrierCode, String trackingNo) {
        return jdbc.sql(FIND_BY_TRACKING)
                .param("carrierCode", carrierCode)
                .param("trackingNo", trackingNo)
                .query(MAPPER)
                .optional();
    }

    /** false = 当前状态不允许（已推进过或已终态），单调性的判决就在这。 */
    public boolean markInTransit(UUID packageId) {
        return jdbc.sql(MARK_IN_TRANSIT).param("id", packageId).update() == 1;
    }

    public boolean markReturned(UUID packageId) {
        return jdbc.sql(MARK_RETURNED).param("id", packageId).update() == 1;
    }

    /** 轨迹时间推进，终态包裹也记——"delivered 之后收到的任何轨迹只记录不改状态"。 */
    public void touchTrackAt(UUID packageId, Instant occurredAt) {
        jdbc.sql(TOUCH_TRACK_AT)
                .param("id", packageId)
                .param("occurredAt", RowMappers.toDb(occurredAt))
                .update();
    }

    public List<ItemRow> findItems(UUID packageId) {
        return jdbc.sql(FIND_ITEMS)
                .param("packageId", packageId)
                .query(ITEM_MAPPER)
                .list();
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
            Instant deliveredAt,
            String deliveredSource) {}

    public record ItemRow(UUID orderLineId, int quantity) {}
}
