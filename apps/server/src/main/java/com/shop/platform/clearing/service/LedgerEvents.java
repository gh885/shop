package com.shop.platform.clearing.service;

import com.shop.platform.clearing.mapper.FreezeStore;
import com.shop.platform.clearing.mapper.SettlementStore;
import com.shop.platform.infra.event.EventInbox;
import com.shop.platform.payment.events.RefundSucceeded;
import com.shop.platform.trade.events.OrderCompleted;
import com.shop.platform.trade.events.OrderPaid;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 交易事件 → 账本。三个事件，三段钱的旅程：
 *
 * <ul>
 *   <li>{@code OrderPaid} —— 钱进来，商家待结算、平台记佣金
 *   <li>{@code OrderCompleted} —— 钱从待结算转到可提现
 *   <li>{@code RefundSucceeded} —— 退的钱冲回去
 * </ul>
 *
 * <p>三条都先过 {@code EventInbox}：事件会被重投，而 {@code posting_group.biz_no} 只能挡住
 * "同一笔业务记两次"，挡不住"同一个事件里多个子单只记了一个"这种半截状态。
 */
@Component
public class LedgerEvents {

    private static final Logger log = LoggerFactory.getLogger(LedgerEvents.class);

    private final PostingService posting;
    private final SettlementStore store;
    private final FreezeStore freezes;
    private final EventInbox inbox;

    public LedgerEvents(PostingService posting, SettlementStore store, FreezeStore freezes, EventInbox inbox) {
        this.posting = Objects.requireNonNull(posting, "posting");
        this.store = Objects.requireNonNull(store, "store");
        this.freezes = Objects.requireNonNull(freezes, "freezes");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
    }

    @ApplicationModuleListener
    public void on(OrderPaid event) {
        if (!inbox.claim("clearing.order-paid", event.eventId())) {
            return;
        }
        for (OrderPaid.SellerOrderRef ref : event.sellerOrders()) {
            posting.recordPaid(
                    ref.sellerOrderId(), ref.merchantId(), ref.goodsAmount(), ref.payableAmount(), event.currency());
        }
    }

    @ApplicationModuleListener
    public void on(OrderCompleted event) {
        if (!inbox.claim("clearing.order-completed", event.eventId())) {
            return;
        }
        for (java.util.UUID sellerOrderId : event.sellerOrderIds()) {
            store.findItem(sellerOrderId)
                    .ifPresent(item ->
                            posting.release(sellerOrderId, item.merchantId(), item.currency(), item.netAmount()));
        }
    }

    @ApplicationModuleListener
    public void on(RefundSucceeded event) {
        if (!inbox.claim("clearing.refund-succeeded", event.eventId())) {
            return;
        }
        if (event.sellerOrderId() == null) {
            // 整组退款没带子单：现在的退款入口都带，真遇到就是上游改坏了，记一笔别静默吞掉
            log.warn("退款事件没有子单号，无法冲销：refund={}", event.refundId());
            return;
        }
        posting.recordRefund(
                event.refundId(),
                event.sellerOrderId(),
                event.amount(),
                event.currency(),
                consumeFreeze(event.bizRef()));
    }

    /**
     * 把这张售后单的冻结吃掉，返回冻住的金额（没冻过就是 0）。
     *
     * <p>先关状态再返回金额：关不上说明重复事件或已经冲销过，这时候再按冻结额记一次，
     * 商家会被扣两遍。
     */
    private long consumeFreeze(String bizRef) {
        if (bizRef == null) {
            return 0;
        }
        try {
            java.util.UUID caseId = java.util.UUID.fromString(bizRef);
            FreezeStore.FreezeRow row = freezes.find(caseId).orElse(null);
            if (row == null || !"frozen".equals(row.status())) {
                return 0;
            }
            return freezes.close(caseId, "consumed") ? row.amount() : 0;
        } catch (IllegalArgumentException e) {
            // bizRef 不是售后单号：这笔退款不是售后发起的，没有冻结
            return 0;
        }
    }
}
