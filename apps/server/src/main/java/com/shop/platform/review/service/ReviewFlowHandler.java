package com.shop.platform.review.service;

import com.shop.platform.infra.event.EventInbox;
import com.shop.platform.review.ReviewProperties;
import com.shop.platform.review.mapper.ReviewMapper;
import com.shop.platform.review.mapper.ReviewMapper.PendingRow;
import com.shop.platform.trade.api.TradeQuery;
import com.shop.platform.trade.api.TradeQuery.Payable;
import com.shop.platform.trade.api.TradeQuery.ShippableLine;
import com.shop.platform.trade.events.OrderCompleted;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 消费 {@code OrderCompleted}，按订单行预生成「待评价」。
 *
 * <p>预生成而不是提交时现算：待评价列表、首页计数、窗口判断都以行为准——事件payload只有
 * 组号与子单号，买家与行快照（标题/图/规格/SPU）走 {@code TradeQuery.findShippable +
 * findPayable} 点查补齐，与 fulfillment 确认收货是同一套组合。快照落库后评价的展示
 * 不再回查 trade / catalog。
 *
 * <p>窗口从 {@code completedAt} 起算，过期自然关闭，不做默认好评。
 *
 * <p>{@code @ApplicationModuleListener} 自带事务（REQUIRES_NEW），inbox 抢占与插入同事务——
 * 插入失败整条回滚，事件留待补发；重复投递被 inbox 与 {@code uq_review_line} 双层挡住。
 */
@Component
public class ReviewFlowHandler {

    private static final Logger log = LoggerFactory.getLogger(ReviewFlowHandler.class);

    private final ReviewMapper reviews;
    private final TradeQuery trade;
    private final EventInbox inbox;
    private final ReviewProperties props;

    public ReviewFlowHandler(ReviewMapper reviews, TradeQuery trade, EventInbox inbox, ReviewProperties props) {
        this.reviews = Objects.requireNonNull(reviews, "reviews");
        this.trade = Objects.requireNonNull(trade, "trade");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
        this.props = Objects.requireNonNull(props, "props");
    }

    @ApplicationModuleListener
    public void on(OrderCompleted event) {
        // 幂等闸门：事件可能被重投
        if (!inbox.claim("review.order-completed", event.eventId())) {
            return;
        }
        Instant reviewableUntil = event.completedAt().plus(props.window());
        int created = 0;
        for (UUID sellerOrderId : event.sellerOrderIds()) {
            var shippable = trade.findShippable(sellerOrderId).orElse(null);
            if (shippable == null) {
                log.warn("OrderCompleted {} 指向不存在的子单 {}，跳过", event.eventId(), sellerOrderId);
                continue;
            }
            UUID buyerId = trade.findPayable(shippable.orderGroupId())
                    .map(Payable::buyerId)
                    .orElse(null);
            if (buyerId == null) {
                log.warn("OrderCompleted {} 的订单组 {} 查不到买家，跳过", event.eventId(), shippable.orderGroupId());
                continue;
            }
            for (ShippableLine line : shippable.lines()) {
                created += reviews.insertPending(new PendingRow(
                        shippable.orderGroupId(),
                        sellerOrderId,
                        line.orderLineId(),
                        line.lineNo(),
                        buyerId,
                        shippable.merchantId(),
                        shippable.shopId(),
                        line.spuId(),
                        line.skuId(),
                        line.title(),
                        line.imageUrl(),
                        line.specValuesJson(),
                        reviewableUntil));
            }
        }
        if (created > 0) {
            log.info("订单组 {} 完结，开放评价：预生成 {} 行待评（截至 {}）", event.orderGroupId(), created, reviewableUntil);
        }
    }
}
