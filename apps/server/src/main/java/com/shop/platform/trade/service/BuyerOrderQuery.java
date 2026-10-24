package com.shop.platform.trade.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.web.CursorCodec;
import com.shop.platform.trade.mapper.BuyerOrderReadMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 买家侧订单读模型。
 *
 * <p><b>走主库，不走搜索索引。</b> 刚下的单在索引里搜不到是经典事故——写侧还没投递，
 * 买家刷新页面就看到"没有订单"，然后去点第二次。
 *
 * <p>归属在 SQL 里（{@code buyer_id} 列随查询下发），不在这里比对：
 * 「先查出来再校验」的窗口里，谁新加一条读就多一个漏比对的机会。查不到一律 404——
 * 告诉对方"这个 id 存在但不是你的"本身就是一次信息泄露。
 */
@Component
public class BuyerOrderQuery {

    private final BuyerOrderReadMapper mapper;

    public BuyerOrderQuery(BuyerOrderReadMapper mapper) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
    }

    public OrderDetail detail(UUID orderGroupId, UUID buyerId) {
        BuyerOrderReadMapper.GroupRow group = mapper.findGroup(orderGroupId, buyerId)
                .orElseThrow(() -> BusinessException.notFound("订单不存在: " + orderGroupId));

        // 行一次取回按子单分组，不再每个子单发一条查询——多商家大单在详情页上是高频读
        List<BuyerOrderReadMapper.SellerOrderRow> sellerOrders = mapper.findSellerOrdersInternal(orderGroupId);
        Map<UUID, List<BuyerOrderReadMapper.LineRow>> linesByOrder =
                mapper
                        .findLinesByOrders(
                                sellerOrders.stream().map(row -> row.id()).toList())
                        .stream()
                        .collect(Collectors.groupingBy(BuyerOrderReadMapper.LineRow::sellerOrderId));

        return new OrderDetail(
                group.id(),
                group.groupNo(),
                group.displayStatus(),
                new Money(group.payableAmount(), group.currency()),
                new Money(group.paidAmount(), group.currency()),
                group.shipAddress(),
                group.expireAt(),
                group.createdAt(),
                sellerOrders.stream()
                        .map(sellerOrder -> new SellerOrderView(
                                sellerOrder.id(),
                                sellerOrder.orderNo(),
                                sellerOrder.shopId(),
                                sellerOrder.fulfillmentStatus(),
                                sellerOrder.closedReason(),
                                new Money(sellerOrder.payableAmount(), sellerOrder.currency()),
                                linesByOrder.getOrDefault(sellerOrder.id(), List.of()).stream()
                                        .map(line -> new LineView(
                                                line.lineNo(),
                                                line.skuId(),
                                                line.title(),
                                                line.imageUrl(),
                                                line.specValuesJson(),
                                                line.quantity(),
                                                line.shippedQty(),
                                                line.receivedQty(),
                                                new Money(line.unitAmount(), line.currency()),
                                                new Money(line.payable(), line.currency())))
                                        .toList()))
                        .toList());
    }

    /**
     * 订单列表页。游标分页：客户端拿 {@code nextCursor} 原样传回翻下一页，null 就是最后一页。
     *
     * <p>状态过滤筛的是展示态（见 mapper 的 {@code DISPLAY_STATUS}），不是库里的支付状态列——
     * 买家列表页看到的标签和筛选必须是同一个词表，筛 "cancelled" 出来一列 "unpaid" 就是事故。
     */
    public OrderPage page(UUID buyerId, String status, String cursor, int limit) {
        requireKnownStatus(status);
        CursorCodec.Point point = cursor == null ? null : CursorCodec.decode(cursor);

        // 多取一条只为判断有没有下一页
        List<BuyerOrderReadMapper.SummaryRow> rows = mapper.findByBuyer(
                buyerId,
                status,
                point == null ? null : point.createdAt(),
                point == null ? null : point.id(),
                limit + 1);
        boolean hasMore = rows.size() > limit;
        List<BuyerOrderReadMapper.SummaryRow> page = hasMore ? rows.subList(0, limit) : rows;

        List<OrderSummary> items = page.stream()
                .map(row -> new OrderSummary(
                        row.id(),
                        row.groupNo(),
                        row.displayStatus(),
                        new Money(row.payableAmount(), row.currency()),
                        row.createdAt()))
                .toList();
        String nextCursor = null;
        if (hasMore && !page.isEmpty()) {
            BuyerOrderReadMapper.SummaryRow last = page.getLast();
            nextCursor = CursorCodec.encode(last.createdAt(), last.id());
        }
        return new OrderPage(items, nextCursor);
    }

    /** 可筛的展示态词表，与 {@link BuyerOrderReadMapper} 的 {@code DISPLAY_STATUS} 一一对应。 */
    static void requireKnownStatus(String status) {
        if (status == null || DISPLAY_STATUSES.contains(status)) {
            return;
        }
        // 前端按 400 处理即可，无需分支，不占错误码注册表
        throw BusinessException.badRequest("status 只能是: "
                + String.join(", ", DISPLAY_STATUSES.stream().sorted().toList()));
    }

    private static final Set<String> DISPLAY_STATUSES =
            Set.of("pending_payment", "paid", "partially_refunded", "refunded", "cancelled", "closed");

    public record OrderPage(List<OrderSummary> items, String nextCursor) {}

    /**
     * 展示态。
     *
     * <p><b>不存这一列，是算出来的。</b> 存了就有第二处真相：订单行的发货计数器一改，
     * 展示态要么忘了同步、要么同步成错的。
     *
     * <p>订单组只看支付和关闭两个维度——它没有履约状态。所以这里只能回答
     * "待付款 / 已付款 / 已取消 / 已退款"，发货进度在子单上。
     */
    public record OrderSummary(UUID orderGroupId, String groupNo, String status, Money payable, Instant createdAt) {}

    public record OrderDetail(
            UUID orderGroupId,
            String groupNo,
            String status,
            Money payable,
            Money paid,
            String shipAddressJson,
            Instant expireAt,
            Instant createdAt,
            List<SellerOrderView> sellerOrders) {}

    public record SellerOrderView(
            UUID sellerOrderId,
            String orderNo,
            UUID shopId,
            String fulfillmentStatus,
            String closedReason,
            Money payable,
            List<LineView> lines) {}

    public record LineView(
            int lineNo,
            UUID skuId,
            String title,
            String imageUrl,
            String specValuesJson,
            int quantity,
            int shippedQty,
            int receivedQty,
            Money unitAmount,
            Money payable) {}
}
