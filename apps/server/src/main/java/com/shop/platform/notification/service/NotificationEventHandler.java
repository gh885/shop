package com.shop.platform.notification.service;

import com.shop.platform.fulfillment.events.ShipmentRecorded;
import com.shop.platform.governance.events.SellerResumed;
import com.shop.platform.governance.events.SellerSuspended;
import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.infra.event.EventInbox;
import com.shop.platform.notification.mapper.NotificationMapper;
import com.shop.platform.notification.mapper.NotificationMapper.NewMessage;
import com.shop.platform.notification.model.NotificationType;
import com.shop.platform.payment.events.RefundSucceeded;
import com.shop.platform.trade.events.OrderCompleted;
import com.shop.platform.trade.events.SellerOrderPlaced;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 六个上游事实 → 六种站内信。只做「把事实翻译成收件人 + 模板参数」，不做渠道发送
 * （渠道外采是以后的适配器，不是这个监听器的职责）。
 *
 * <p>{@code @ApplicationModuleListener} 自带事务（REQUIRES_NEW），inbox 抢占与插入同事务——
 * 插入失败整条回滚，事件留待补发；重复投递被 inbox 挡住。文案不落库：type + params 由前端
 * i18n 模板渲染，后端换语言不用迁移历史消息。
 */
@Component
public class NotificationEventHandler {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventHandler.class);

    private final NotificationMapper messages;
    private final EventInbox inbox;

    public NotificationEventHandler(NotificationMapper messages, EventInbox inbox) {
        this.messages = Objects.requireNonNull(messages, "messages");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
    }

    /** 商家：新订单待发货。 */
    @ApplicationModuleListener
    public void onSellerOrderPlaced(SellerOrderPlaced event) {
        if (!inbox.claim("notification.seller-order-placed", event.eventId())) {
            return;
        }
        insert(
                NotificationType.ORDER_PLACED,
                null,
                event.merchantId(),
                Map.of(
                        "orderGroupId", event.orderGroupId(),
                        "sellerOrderId", event.sellerOrderId()),
                null);
    }

    /** 买家：包裹已发货，带承运商与运单号。 */
    @ApplicationModuleListener
    public void onShipmentRecorded(ShipmentRecorded event) {
        if (!inbox.claim("notification.shipment-recorded", event.eventId())) {
            return;
        }
        insert(
                NotificationType.SHIPMENT_RECORDED,
                event.buyerId(),
                null,
                Map.of(
                        "orderGroupId", event.orderGroupId(),
                        "carrierCode", event.carrierCode(),
                        "trackingNo", event.trackingNo()),
                "/orders/" + event.orderGroupId());
    }

    /** 买家：退款已到账。 */
    @ApplicationModuleListener
    public void onRefundSucceeded(RefundSucceeded event) {
        if (!inbox.claim("notification.refund-succeeded", event.eventId())) {
            return;
        }
        insert(
                NotificationType.REFUND_SUCCEEDED,
                event.buyerId(),
                null,
                Map.of(
                        "orderGroupId", event.orderGroupId(),
                        "amount", event.amount().amount(),
                        "currency", event.amount().currency()),
                "/orders/" + event.orderGroupId());
    }

    /** 买家：订单完成，去评价。 */
    @ApplicationModuleListener
    public void onOrderCompleted(OrderCompleted event) {
        if (!inbox.claim("notification.order-completed", event.eventId())) {
            return;
        }
        insert(NotificationType.ORDER_COMPLETED, event.buyerId(), null, Map.of(), "/account/reviews?tab=pending");
    }

    /** 商家：店铺被平台暂停。 */
    @ApplicationModuleListener
    public void onSellerSuspended(SellerSuspended event) {
        if (!inbox.claim("notification.seller-suspended", event.eventId())) {
            return;
        }
        insert(NotificationType.SELLER_SUSPENDED, null, event.merchantId(), Map.of("reason", event.reason()), null);
    }

    /** 商家：店铺恢复经营。 */
    @ApplicationModuleListener
    public void onSellerResumed(SellerResumed event) {
        if (!inbox.claim("notification.seller-resumed", event.eventId())) {
            return;
        }
        insert(NotificationType.SELLER_RESUMED, null, event.merchantId(), Map.of("reason", event.reason()), null);
    }

    private void insert(NotificationType type, UUID buyerId, UUID merchantId, Map<String, Object> params, String link) {
        messages.insert(new NewMessage(
                buyerId != null ? "buyer" : "merchant",
                buyerId,
                merchantId,
                type.dbValue(),
                JsonColumns.write(params),
                link));
    }
}
