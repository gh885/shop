package com.shop.platform.trade.service;

import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.event.EventInbox;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.payment.events.PaymentSucceeded;
import com.shop.platform.trade.events.OrderPaid;
import com.shop.platform.trade.mapper.OrderEventStore;
import com.shop.platform.trade.mapper.OrderGroupStore;
import com.shop.platform.trade.mapper.OrderLineStore;
import com.shop.platform.trade.mapper.SellerOrderStore;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 消费 {@code PaymentSucceeded}，把订单推进到已支付。
 *
 * <p>三条必须记住的：
 *
 * <ul>
 *   <li><b>买家点"我已支付"不算数。</b> 只有这个事件才算——它背后是渠道回调或主动查单
 *   <li><b>金额不符就拒收。</b> 钱确实到了，但到得不对；这时不发货，等人工查。不拒收等于白送一单
 *   <li><b>与超时关单抢同一行。</b> 两边用同一个前置条件，谁改到行谁赢。输了说明单已关，要退款
 * </ul>
 */
@Component
public class PaymentSucceededHandler {

    private static final Logger log = LoggerFactory.getLogger(PaymentSucceededHandler.class);

    private final OrderGroupStore groups;
    private final SellerOrderStore sellerOrders;
    private final OrderLineStore lines;
    private final OrderEventStore events;
    private final InventoryCommand inventory;
    private final EventInbox inbox;
    private final ApplicationEventPublisher publisher;

    public PaymentSucceededHandler(
            OrderGroupStore groups,
            SellerOrderStore sellerOrders,
            OrderLineStore lines,
            OrderEventStore events,
            InventoryCommand inventory,
            EventInbox inbox,
            ApplicationEventPublisher publisher) {
        this.groups = Objects.requireNonNull(groups, "groups");
        this.sellerOrders = Objects.requireNonNull(sellerOrders, "sellerOrders");
        this.lines = Objects.requireNonNull(lines, "lines");
        this.events = Objects.requireNonNull(events, "events");
        this.inventory = Objects.requireNonNull(inventory, "inventory");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
    }

    /**
     * 消费支付成功事件。
     *
     * <p>{@code @ApplicationModuleListener} 自己就带事务（{@code @TransactionalEventListener} +
     * {@code @Transactional(REQUIRES_NEW)} 语义由 Modulith 配好），所以**不能再加 {@code @Transactional}**，
     * 加了 Spring 会在启动时报"@TransactionalEventListener method must not be annotated with @Transactional"。
     */
    @ApplicationModuleListener
    public void on(PaymentSucceeded event) {
        // 幂等闸门：同一个事件 id 只处理一次。与下面的 CAS 是两道保险，缺一不可——
        // 事件可能被重投，而 CAS 只能挡住"状态已经变了"，挡不住"同一笔钱被记两次事件"
        if (!inbox.claim("trade.payment-succeeded", event.eventId())) {
            return;
        }

        if (!event.matched()) {
            // 钱到了但金额不对：不推进订单，留给人工。记一条事件才好追溯
            log.warn(
                    "支付金额不符，拒收：groupId={} 渠道={} 到账={} 应付={} 币种={}",
                    event.orderGroupId(),
                    event.channel(),
                    event.amount().amount(),
                    event.expectedAmount().amount(),
                    event.amount().currency());
            events.append(
                    "group:" + event.orderGroupId() + ":payment:amount_mismatch:" + event.eventId(),
                    "group",
                    event.orderGroupId(),
                    "payment",
                    "unpaid",
                    "amount_mismatch",
                    "channel",
                    null,
                    "渠道金额 "
                            + event.amount().amount()
                            + " ≠ 应付 "
                            + event.expectedAmount().amount()
                            + "（"
                            + event.amount().currency()
                            + "）");
            return;
        }

        if (!groups.markPaid(event.orderGroupId(), event.amount().amount())) {
            // 影响 0 行：超时任务赢了，或者重复回调。两种都要看当前状态再决定
            OrderGroupStore.GroupRow current = groups.find(event.orderGroupId()).orElse(null);
            log.info(
                    "支付成功但订单状态未推进：groupId={} 当前={} 关闭于={}",
                    event.orderGroupId(),
                    current == null ? "不存在" : current.paymentStatus(),
                    current == null ? null : current.closedAt());
            return;
        }

        // 已付款的订单必须把预占转成 committed：货还在仓库里，账上不该减
        List<SellerOrderStore.SellerOrderRow> sellerOrdersOfGroup = sellerOrders.findByGroup(event.orderGroupId());
        for (SellerOrderStore.SellerOrderRow sellerOrder : sellerOrdersOfGroup) {
            for (int lineNo : lines.lineNosOf(sellerOrder.id())) {
                inventory.commit(sellerOrder.id(), lineNo);
            }
        }

        events.append(
                "group:" + event.orderGroupId() + ":payment:paid:" + event.eventId(),
                "group",
                event.orderGroupId(),
                "payment",
                "unpaid",
                "paid",
                "channel",
                null,
                "支付成功");

        // 发 OrderPaid：fulfillment 收到后给每个子单建发货任务（承诺时效从支付时间起算）。
        // 与 PaymentSucceeded 的分工——那个是"渠道说钱到了"，这个是"trade 确认这单该发货了"，
        // 中间隔着金额校验和上面的 CAS。金额不符时前者到了、后者不发。
        publisher.publishEvent(new OrderPaid(
                Ids.newId(),
                event.orderGroupId(),
                event.paymentId(),
                event.amount(),
                sellerOrdersOfGroup.stream()
                        .map(row -> new OrderPaid.SellerOrderRef(
                                row.id(),
                                row.merchantId(),
                                row.shopId(),
                                new Money(row.goodsAmount(), row.currency()),
                                new Money(row.payableAmount(), row.currency())))
                        .toList(),
                Instant.now()));
    }
}
