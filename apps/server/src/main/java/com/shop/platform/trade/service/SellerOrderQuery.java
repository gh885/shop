package com.shop.platform.trade.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.web.CursorCodec;
import com.shop.platform.trade.mapper.SellerOrderReadMapper;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

/**
 * 卖家侧订单读模型。
 *
 * <p><b>为什么这个类必须存在。</b> 在它之前，卖家侧只有「发货」和「看包裹」两个入口，
 * 而它们都要 {@code sellerOrderId} 作为路径参数——商家没有任何办法拿到那个 id。
 * 于是整条发货链路在前端是不可达的：接口都在，入口没有。
 *
 * <p><b>三条与买家侧不同的规矩：</b>
 *
 * <ul>
 *   <li><b>状态轴是履约不是支付。</b> 商家关心「要不要发货」，所以展示态从
 *       {@code fulfillment_status} 来（见 {@code SellerOrderReadMapper.DISPLAY_STATUS}）。
 *   <li><b>手机号默认脱敏。</b> 商家详情页里的地址是**别人**的地址。列表页一次摊开几十个
 *       完整手机号，那是可以直接拿去做营销的数据；而商家看详情时多数只是核对。
 *       只有「发货」这个动作需要完整号码——那由一个独立的、能留下痕迹的端点给
 *       （{@link #receiverPhone}），不在详情里顺带返回。
 *   <li><b>归属与店铺范围都在 SQL 里。</b> 每条查询都凭 {@code AccessScope.Seller} 绑
 *       {@code merchant_id}（别家的单查出空集，折 404）与 {@code shop_id IN (...)}
 *       （未授权店同样查不出）——不存在「存在但不是你的」这种确认。
 * </ul>
 */
@Component
public class SellerOrderQuery {

    /**
     * 卖家侧的展示态词表。**与买家侧不是同一套**——筛选词表必须与展示值同源，
     * 筛 "shipped" 出来一列 "awaiting_shipment" 就是事故。
     *
     * <p>放在这里而不是枚举：它是 SQL 里那个 {@code CASE} 的镜像，两处必须一起改。
     * 用 {@code Set} 而不是枚举，是因为它只用来校验入参，不参与任何业务判断。
     */
    private static final Set<String> DISPLAY_STATUSES =
            Set.of("pending_payment", "awaiting_shipment", "partially_shipped", "shipped", "received", "closed");

    private final SellerOrderReadMapper mapper;

    public SellerOrderQuery(SellerOrderReadMapper mapper) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
    }

    /**
     * 卖家订单列表。按子单列，不按订单组——一个买家跨三家店下单，三家店各看各的那一份。
     *
     * <p>范围随凭据进来（{@code AccessScope.Seller}）：归属商家拦别家，店铺授权拦同商家内
     * 未授权的店。空集 = 一个店都碰不了，SQL 折恒假自然返回空页。
     *
     * @param status 展示态，null = 不过滤；不在词表里直接 400（不放进去变成永远空页）
     * @param cursor 上一页的 {@code nextCursor}
     * @param limit 服务端已 clamp，这里不再判
     */
    @Transactional(readOnly = true)
    public OrderPage page(AccessScope.Seller scope, String status, String cursor, int limit) {
        requireKnownStatus(status);
        CursorCodec.Point point = cursor == null || cursor.isBlank() ? null : CursorCodec.decode(cursor);

        // 多取一条只为判断有没有下一页
        List<SellerOrderReadMapper.SummaryRow> rows = mapper.findByMerchant(
                scope, status, point == null ? null : point.createdAt(), point == null ? null : point.id(), limit + 1);

        boolean hasMore = rows.size() > limit;
        List<SellerOrderReadMapper.SummaryRow> page = hasMore ? rows.subList(0, limit) : rows;

        String nextCursor = hasMore
                ? CursorCodec.encode(page.getLast().createdAt(), page.getLast().id())
                : null;

        return new OrderPage(
                page.stream()
                        .map(row -> new OrderSummary(
                                row.id(),
                                row.orderNo(),
                                row.groupId(),
                                row.shopId(),
                                row.displayStatus(),
                                row.fulfillmentStatus(),
                                new Money(row.payableAmount(), row.currency()),
                                row.createdAt()))
                        .toList(),
                nextCursor);
    }

    /**
     * 一张子单的详情。归属列进 SQL，别家的单折 404；店不在操作人范围内同样折 404。
     *
     * <p>手机号已脱敏——要完整号码走 {@link #receiverPhone}，那是另一个动作。
     */
    @Transactional(readOnly = true)
    public OrderDetail detail(UUID sellerOrderId, AccessScope.Seller scope) {
        SellerOrderReadMapper.DetailRow order = requireDetail(sellerOrderId, scope);

        List<LineView> lines = mapper.findLines(sellerOrderId).stream()
                .map(line -> new LineView(
                        line.id(),
                        line.lineNo(),
                        line.skuId(),
                        line.spuId(),
                        line.title(),
                        line.imageUrl(),
                        line.specValuesJson(),
                        line.quantity(),
                        line.shippedQty(),
                        line.receivedQty(),
                        line.refundedQty(),
                        // 剩余可发由 trade 算，不让调用方自己减——已退的件不许再发
                        line.quantity() - line.shippedQty() - line.refundedQty(),
                        new Money(line.unitAmount(), line.currency()),
                        new Money(line.payableAmount(), line.currency())))
                .toList();

        return new OrderDetail(
                order.id(),
                order.orderNo(),
                order.groupId(),
                order.groupNo(),
                order.shopId(),
                order.displayStatus(),
                order.fulfillmentStatus(),
                order.paymentStatus(),
                order.paidAt(),
                order.closedReason(),
                order.closedAt(),
                new Money(order.payableAmount(), order.currency()),
                maskedAddress(order.shippingAddressJson()),
                order.createdAt(),
                lines);
    }

    /**
     * 发货用的收件人手机号。**这是唯一给完整号码的入口，而且是一个独立动作。**
     *
     * <p>为什么不放在详情里：详情是高频只读页面，把完整号码塞进去等于每看一次就泄露一次；
     * 而这个端点可以被单独审计、单独限流、单独在将来加「打码通话」之类的替代方案。
     *
     * <p>为什么不放在列表里：列表一次几十条，摊开就是一份可营销名单。
     *
     * <p>只返回手机号，不返回地址——地址在详情里（脱敏手机号不影响发货，商家按地址寄就行）。
     */
    @Transactional(readOnly = true)
    public ReceiverPhone receiverPhone(UUID sellerOrderId, AccessScope.Seller scope) {
        SellerOrderReadMapper.DetailRow order = requireDetail(sellerOrderId, scope);
        AddressSnapshot address = readAddress(order.shippingAddressJson());
        return new ReceiverPhone(address.receiverName(), address.phone());
    }

    /**
     * 详情点查。归属与店铺范围都在 SQL 谓词里（{@code findDetail}），查空即 404：
     * 告诉对方「这个 id 存在但不是你的」本身就是一次信息泄露。
     */
    private SellerOrderReadMapper.DetailRow requireDetail(UUID sellerOrderId, AccessScope.Seller scope) {
        return mapper.findDetail(sellerOrderId, scope)
                .orElseThrow(() -> BusinessException.notFound("订单不存在: " + sellerOrderId));
    }

    /**
     * 把下单快照里的地址解析出来，手机号脱敏。
     *
     * <p>解析失败不抛：地址快照是历史数据，格式可能随版本变化（V…__order_shipper_snapshot 那类迁移改过它）。
     * 一条老单子解析不出来，不该让整个详情页 500——返回一个「地址缺失」的占位，让商家知道去查而不是以为系统坏了。
     */
    private static AddressView maskedAddress(String json) {
        try {
            AddressSnapshot address = readAddress(json);
            // 手机号为空就不脱敏——{@code PhoneNumber.mask(null)} 会返回占位串 "******"，
            // 那是给「有号码但不能给」用的，不是给「根本没有号码」用的。两者混成一句
            // 会让前端分不清「地址缺失」和「号码被遮」。
            return new AddressView(
                    address.receiverName(),
                    address.phone() == null || address.phone().isBlank() ? null : PhoneNumber.mask(address.phone()),
                    address.province(),
                    address.city(),
                    address.district(),
                    address.detail());
        } catch (RuntimeException e) {
            // 快照解析不出来（老单子的格式随迁移变过）：给一个全空的占位，
            // 让商家知道去查而不是以为系统坏了。整页 500 更糟——他会去点第二次。
            return new AddressView(null, null, null, null, null, null);
        }
    }

    private static AddressSnapshot readAddress(String json) {
        AddressSnapshot parsed = com.shop.platform.infra.db.JsonColumns.read(json, new TypeReference<>() {});
        if (parsed == null) {
            throw new IllegalStateException("地址快照为空");
        }
        return parsed;
    }

    private static void requireKnownStatus(String status) {
        if (status != null && !status.isBlank() && !DISPLAY_STATUSES.contains(status)) {
            throw BusinessException.badRequest("未知的订单状态: " + status);
        }
    }

    /**
     * 下单时的地址快照。字段名必须与写入侧 {@code TradeService.ShipAddress} **逐字一致**——
     * Jackson 按字段名映射，少一个字段那一列就是 null（不报错，静默变空）。
     * {@code regionCode} 这里用不上（商家不看区划码，只看文字地址），但必须声明，
     * 否则反序列化会因未知字段失败或把它丢掉。
     */
    record AddressSnapshot(
            String receiverName,
            String phone,
            String regionCode,
            String province,
            String city,
            String district,
            String detail) {}

    /**
     * 展示用的地址。手机号已脱敏。
     *
     * <p>六个字段全可空：老单子解析不出来时给的就是这个形状，前端据此显示「地址信息不可用」，
     * 而不是整页报错。
     */
    @Schema(name = "SellerOrderAddressView")
    public record AddressView(
            String receiverName, String phone, String province, String city, String district, String detail) {}

    /** 发货用的收件人信息。**手机号明文**——只有这个端点给。 */
    public record ReceiverPhone(String receiverName, String phone) {}

    /** 列表一页。{@code nextCursor} 为 null 就是最后一页。 */
    @Schema(name = "SellerOrderPage")
    public record OrderPage(List<OrderSummary> items, @Schema(nullable = true) String nextCursor) {}

    /** 列表的一行。够画一张卡片：单号、金额、状态、时间。 */
    @Schema(name = "SellerOrderSummary")
    public record OrderSummary(
            UUID sellerOrderId,
            String orderNo,
            UUID groupId,
            UUID shopId,
            String status,
            String fulfillmentStatus,
            Money payableAmount,
            Instant createdAt) {}

    /** 详情。{@code lines} 里带「剩余可发」，前端不该自己减。 */
    @Schema(name = "SellerOrderDetail")
    public record OrderDetail(
            UUID sellerOrderId,
            String orderNo,
            UUID groupId,
            String groupNo,
            UUID shopId,
            String status,
            String fulfillmentStatus,
            String paymentStatus,
            @Schema(nullable = true) Instant paidAt,
            @Schema(nullable = true) String closedReason,
            @Schema(nullable = true) Instant closedAt,
            Money payableAmount,
            AddressView shippingAddress,
            Instant createdAt,
            List<LineView> lines) {}

    /**
     * 订单行。
     *
     * @param remaining 还剩多少可发 = {@code quantity - shippedQty - refundedQty}。
     *     已退的件不许再发——全额退款未发货的单还能发货就是买家钱货两得
     */
    @Schema(name = "SellerOrderLineView")
    public record LineView(
            UUID orderLineId,
            int lineNo,
            UUID skuId,
            UUID spuId,
            String title,
            @Schema(nullable = true) String imageUrl,
            @Schema(nullable = true) String specValuesJson,
            int quantity,
            int shippedQty,
            int receivedQty,
            int refundedQty,
            int remaining,
            Money unitAmount,
            Money payableAmount) {}
}
