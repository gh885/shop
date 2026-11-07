package com.shop.platform.fulfillment.mapper;

import com.shop.platform.fulfillment.model.PackageStatus;
import com.shop.platform.infra.security.AccessScope;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * {@code package} 与 {@code package_item} 的读写。
 *
 * <p>所有状态迁移都是条件更新：影响 0 行是判决，不是异常。
 */
@Mapper
public interface PackageMapper {

    String COLUMNS = "id, package_no, seller_order_id, merchant_id, shop_id, carrier_code, tracking_no, "
            + "status, shipped_at, delivered_at, delivered_source, signed_by, last_trace_at";

    @Insert(
            """
            INSERT INTO fulfillment.package
                (id, package_no, seller_order_id, merchant_id, shop_id, carrier_code, tracking_no,
                 status, shipped_at)
            VALUES (#{pkg.id}, #{pkg.packageNo}, #{pkg.sellerOrderId}, #{pkg.merchantId}, #{pkg.shopId},
                    #{pkg.carrierCode}, #{pkg.trackingNo}, 'shipped', now())
            """)
    void insert(@Param("pkg") NewPackage pkg);

    @Insert(
            """
            INSERT INTO fulfillment.package_item (package_id, order_line_id, quantity)
            VALUES (#{packageId}, #{orderLineId}, #{quantity})
            """)
    void insertItem(
            @Param("packageId") UUID packageId,
            @Param("orderLineId") UUID orderLineId,
            @Param("quantity") int quantity);

    /**
     * 无归属点查，仅供已自行完成归属校验的内部链路（签收前的「包裹→子单→买家」链路校验、轨迹回写）。
     * {@code DataScopeTest} 靠 Internal 后缀豁免——controller 调它会被 ArchUnit 拦下。
     */
    @Select("SELECT " + COLUMNS + " FROM fulfillment.package WHERE id = #{id}")
    Optional<PackageRow> findInternal(@Param("id") UUID packageId);

    /**
     * 单号定位，买家「我的包裹到哪了」用。{@code package_no} 是随机能力令牌，知道单号即有权查——
     * 能力令牌本身是访问凭证，不再叠归属列。
     */
    @Select("SELECT " + COLUMNS + " FROM fulfillment.package WHERE package_no = #{packageNo}")
    Optional<PackageRow> findByPackageNoInternal(@Param("packageNo") String packageNo);

    /**
     * 卖家侧查包裹：归属列进 SQL，别人的子单查出来就是空；{@code scope.shopIds} 再收窄一层
     * （子账号只看授权店的包裹）。空集由调用方拦截。
     *
     * <p><b>参数是 {@link AccessScope.Seller} 而不是两个裸 uuid</b>：它只能在 {@code Authorizer}
     * 里构造出来，所以"判了权但查库时忘了带范围"在类型上写不出来。
     */
    // 首段必须是普通字符串：文本块会剥掉行尾空格，"SELECT " 尾空格一剥就成了 SELECTid
    @Select(
            "<script>\nSELECT " + COLUMNS
                    + """
              FROM fulfillment.package
             WHERE seller_order_id = #{sellerOrderId}
               AND merchant_id = #{scope.merchantId}
               AND shop_id IN
               <foreach collection="scope.shopIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
             ORDER BY created_at
            </script>
            """)
    List<PackageRow> findBySellerOrder(
            @Param("sellerOrderId") UUID sellerOrderId, @Param("scope") AccessScope.Seller scope);

    /**
     * 无归属版，仅供已自行完成归属校验的内部链路（买家路径、轨迹回写）。
     * {@code DataScopeTest} 靠 Internal 后缀豁免——controller 调它会被 ArchUnit 拦下。
     */
    @Select("SELECT " + COLUMNS
            + " FROM fulfillment.package WHERE seller_order_id = #{sellerOrderId} ORDER BY created_at")
    List<PackageRow> findBySellerOrderInternal(@Param("sellerOrderId") UUID sellerOrderId);

    /** webhook 侧按 (承运商, 运单号) 定位包裹。走 uq_package_tracking 这把唯一索引。 */
    @Select("SELECT " + COLUMNS
            + " FROM fulfillment.package WHERE carrier_code = #{carrierCode} AND tracking_no = #{trackingNo}")
    Optional<PackageRow> findByTrackingNoInternal(
            @Param("carrierCode") String carrierCode, @Param("trackingNo") String trackingNo);

    /**
     * 轨迹推进到运输中。前置条件 {@code status = 'shipped'} 就是单调性：
     * 已是 in_transit / 终态的包裹影响 0 行，一条迟到的"揽收"退不回去。false = 当前状态不允许（已推进过或已终态），
     * 单调性的判决就在这。
     */
    @Update(
            """
            UPDATE fulfillment.package
               SET status = 'in_transit'
             WHERE id = #{id} AND status = 'shipped'
            """)
    boolean markInTransit(@Param("id") UUID packageId);

    /** 拒收/退回。终态之一，与 delivered 一样由前置条件挡重放。 */
    @Update(
            """
            UPDATE fulfillment.package
               SET status = 'returned'
             WHERE id = #{id} AND status NOT IN ('delivered', 'returned', 'cancelled')
            """)
    boolean markReturned(@Param("id") UUID packageId);

    /** 记录轨迹时间。取 GREATEST：乱序到达的旧轨迹不能把 last_trace_at 拨回去。轨迹时间推进，终态包裹也记——"delivered 之后收到的任何轨迹只记录不改状态"。 */
    @Update(
            """
            UPDATE fulfillment.package
               SET last_trace_at = GREATEST(COALESCE(last_trace_at, #{occurredAt}), #{occurredAt})
             WHERE id = #{id}
            """)
    void touchTrackAt(@Param("id") UUID packageId, @Param("occurredAt") Instant occurredAt);

    /**
     * 签收。前置条件 {@code status NOT IN (终态)} 就是幂等闸门：重放影响 0 行。
     *
     * <p>不写成 {@code status = 'shipped'}：包裹可能已经推进到 {@code in_transit}，
     * 那时签收也必须成立——轨迹回写还没做，但状态机的形状要先对。
     *
     * @param source 谁确认的：buyer（买家手点）/ system（到期自动确认）/ trace（承运商轨迹）
     * @param signedBy 签收人，承运商轨迹里有就存；买家手点与系统到期都没有，传 null。
     *     争议时"谁签的字"和"谁确认的"是两个问题，前者只有渠道知道
     * @return false = 已经是终态，本次跳过
     */
    @Update(
            """
            UPDATE fulfillment.package
               SET status = 'delivered', delivered_at = now(), delivered_source = #{source},
                   signed_by = COALESCE(#{signedBy}, signed_by)
             WHERE id = #{id} AND status NOT IN ('delivered', 'returned', 'cancelled')
            """)
    boolean markDelivered(
            @Param("id") UUID packageId, @Param("source") String source, @Param("signedBy") String signedBy);

    /**
     * 自动确认收货的扫描面：发货后过了宽限还没签收的包裹。
     * 状态驱动——错过一轮的包裹还在这个扫描面里，下一轮照扫，不需要队列兜底。
     */
    @Select(
            "SELECT " + COLUMNS
                    + """
              FROM fulfillment.package
             WHERE status IN ('shipped', 'in_transit') AND shipped_at < #{olderThan}
             ORDER BY shipped_at
             LIMIT #{limit}
            """)
    List<PackageRow> findAutoReceivableInternal(@Param("olderThan") Instant olderThan, @Param("limit") int limit);

    /**
     * 包裹里的行。
     *
     * <p><b>不 JOIN {@code trade.order_line}。</b> 跨 schema 不 JOIN 是硬规则，而且那个 JOIN 会把
     * trade 的表结构钉进 fulfillment 的 SQL 里。行号由调用方通过 {@code TradeQuery} 补——
     * 那才是这两个模块之间唯一允许的通道。
     */
    @Select(
            """
            SELECT order_line_id, quantity
              FROM fulfillment.package_item
             WHERE package_id = #{packageId}
             ORDER BY order_line_id
            """)
    List<ItemRow> findItems(@Param("packageId") UUID packageId);

    /**
     * {@code shopId} 冗余自子单（下单后不可变）：卖家侧按店收窄不用回查 trade，
     * 跨 schema JOIN 是铁律禁止的。
     */
    public record NewPackage(
            UUID id,
            String packageNo,
            UUID sellerOrderId,
            UUID merchantId,
            UUID shopId,
            String carrierCode,
            String trackingNo) {}

    public record PackageRow(
            UUID id,
            String packageNo,
            UUID sellerOrderId,
            UUID merchantId,
            UUID shopId,
            String carrierCode,
            String trackingNo,
            PackageStatus status,
            Instant shippedAt,
            Instant deliveredAt,
            String deliveredSource,
            String signedBy,
            Instant lastTraceAt) {}

    public record ItemRow(UUID orderLineId, int quantity) {}
}
