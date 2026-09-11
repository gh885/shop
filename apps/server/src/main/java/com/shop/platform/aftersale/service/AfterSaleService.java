package com.shop.platform.aftersale.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.aftersale.events.AfterSaleRefundedEvent;
import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.mapper.TicketEvent;
import com.shop.platform.aftersale.mapper.TicketEventMapper;
import com.shop.platform.aftersale.mapper.TicketMapper;
import com.shop.platform.aftersale.model.TicketAction;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.common.Money;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.logistics.api.ReturnShipmentCommand;
import com.shop.platform.logistics.api.ReturnShipmentView;
import com.shop.platform.order.api.OrderAfterSaleView;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderReadQuery;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 售后单的唯一驱动：买家申请/撤销/回寄，卖家同意/拒绝/收货。
 *
 * <p>转移合法性在 {@link TicketAction} 一张表；本类只负责驱动：取进行中的单 → 归属校验 → 条件更新
 * （WHERE status = action.from()，影响行数即并发闸门）→ 时间线 → 写回订单投影 → 副作用（退款事件 / 回补库存）。
 * 申请前置（订单已完成且申请窗口未过）与回补所需行项经 order :: api 只读点查，不碰 orders schema。
 *
 * <p>退款：payment 同步监听 {@link AfterSaleRefundedEvent} 经网关落退款单据（同事务），落不成整体回滚、
 * 售后单停回原态——不假报「已退款」。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AfterSaleService {

    private final TicketMapper ticketMapper;

    private final TicketEventMapper ticketEventMapper;

    private final OrderReadQuery orderReadQuery;

    private final OrderCommand orderCommand;

    private final StockCommand stockCommand;

    private final ApplicationEventPublisher events;

    /** 回寄包裹落 logistics（同事务）：退货物流不再是第二套字符串，而是复用正向包裹与轨迹的那一套 */
    private final ReturnShipmentCommand returnShipmentCommand;

    // ========== 买家 ==========

    /** 申请售后：仅「已完成 + 申请窗口未过 + 无进行中的单」可发起；退款口径 = 整单实付（V1 整单售后） */
    @Transactional
    public Ticket apply(UUID userId, UUID orderId, TicketType type, String reason) {
        OrderAfterSaleView order = Validate.present(orderReadQuery.afterSaleViewById(orderId), "订单不存在");
        Validate.isTrue(order.userId().equals(userId), 404, "订单不存在");
        Validate.isTrue(order.afterSaleOpenAt(OffsetDateTime.now()), 409, TicketAction.APPLY.conflictMessage());

        String trimmed = Text.trimToNull(reason);
        Ticket ticket = Ticket.builder()
                .orderId(orderId)
                .userId(userId)
                .shopId(order.shopId())
                .type(type)
                .status(TicketStatus.APPLYING)
                .reason(trimmed)
                .refundAmount(order.payAmount())
                .currency(order.currency())
                .build();
        // uk_tickets_open_per_order：并发重复申请只能有一张进行中
        DuplicateKeys.conflictOnDuplicate(() -> ticketMapper.insert(ticket), "该订单已有进行中的售后");
        record(ticket, TicketAction.APPLY, trimmed);
        orderCommand.syncAfterSale(orderId, TicketStatus.APPLYING.name(), null);
        log.info("[AFTERSALE] 申请售后, orderId={}, ticketId={}, type={}", orderId, ticket.getId(), type);
        return ticket;
    }

    /** 撤销申请：APPLYING → CLOSED（终态） */
    @Transactional
    public void cancel(UUID userId, UUID orderId) {
        transition(requireBuyerOpen(userId, orderId, TicketAction.CLOSE), TicketAction.CLOSE, null, u -> {});
    }

    /**
     * 回寄并填写退货物流单（仅退货退款、处于 RETURNING）：态不变，只落物流单并记时间线。
     *
     * <p>回寄包裹落在 logistics（{@link ReturnShipmentCommand}，同事务）：它之后自动享有正向包裹的一切
     * ——承运商推送按运单号就能匹配到它、轮询兜底会扫它、买家「查看物流」里会看到它的轨迹。
     * 售后单上的两列是<b>投影</b>（拿命令返回值写回，展示用），轨迹真相在 logistics。
     */
    @Transactional
    public void returnGoods(UUID userId, UUID orderId, String carrierCode, String carrierName, String trackingNo) {
        Ticket ticket = requireBuyerOpen(userId, orderId, TicketAction.RETURN_GOODS);
        ReturnShipmentView shipment = returnShipmentCommand.record(
                orderId, ticket.getUserId(), ticket.getShopId(), carrierCode, carrierName, trackingNo);
        transition(ticket, TicketAction.RETURN_GOODS, shipment.carrierName() + " " + shipment.trackingNo(), u -> u.set(
                        Ticket::getReturnLogisticsCompany, shipment.carrierName())
                .set(Ticket::getReturnTrackingNo, shipment.trackingNo()));
    }

    /** 买家视角最近一张售后单（含终态）；非本人的订单同不存在 */
    public Optional<Ticket> latestForBuyer(UUID userId, UUID orderId) {
        return Optional.ofNullable(ticketMapper.selectLatestByOrder(orderId))
                .filter(t -> t.getUserId().equals(userId));
    }

    // ========== 卖家 ==========

    /**
     * 同意售后，按已申请的 type 分派：仅退款 APPLYING → REFUNDED 一步到位（同意即退款，无「已同意待退款」悬挂态）；
     * 退货退款 APPLYING → RETURNING（进入退货流程，暂不退款），等买家回寄、卖家收货后再退。
     */
    @Transactional
    public void agree(UUID shopId, UUID orderId) {
        Ticket ticket = requireSellerOpen(shopId, orderId, TicketAction.REFUND);
        if (ticket.getType() == TicketType.RETURN_REFUND) {
            transition(ticket, TicketAction.AGREE_RETURN, null, u -> {});
            return;
        }
        refund(ticket, TicketAction.REFUND);
    }

    /** 拒绝申请：APPLYING → REJECTED（终态） */
    @Transactional
    public void reject(UUID shopId, UUID orderId) {
        transition(requireSellerOpen(shopId, orderId, TicketAction.REJECT), TicketAction.REJECT, null, u -> {});
    }

    /**
     * 确认收到退货（仅退货退款、处于 RETURNING）：RETURNING → REFUNDED，退款并回补总库存（货真的回来了）。
     * 仅退款路径没有本步——它同意即退，不回补库存。
     */
    @Transactional
    public void receiveReturn(UUID shopId, UUID orderId) {
        Ticket ticket = requireSellerOpen(shopId, orderId, TicketAction.RECEIVE_RETURN);
        refund(ticket, TicketAction.RECEIVE_RETURN);
        stockCommand.restock(
                orderId,
                orderReadQuery.linesById(orderId).stream()
                        .map(l -> new StockLine(l.skuId(), l.quantity()))
                        .toList());
    }

    /** 卖家视角最近一张售后单（含终态）；非本店的订单同不存在 */
    public Optional<Ticket> latestForShop(UUID shopId, UUID orderId) {
        return Optional.ofNullable(ticketMapper.selectLatestByOrder(orderId))
                .filter(t -> t.getShopId().equals(shopId));
    }

    // ========== 私有 ==========

    /** 退款落点（仅退款同意 / 退货收货共用）：转 REFUNDED 回填时刻，再通知 payment 同事务落退款单据 */
    private void refund(Ticket ticket, TicketAction action) {
        OffsetDateTime now = OffsetDateTime.now();
        transition(ticket, action, null, u -> u.set(Ticket::getRefundedAt, now));
        events.publishEvent(new AfterSaleRefundedEvent(
                ticket.getOrderId(), ticket.getUserId(), Money.ofFen(ticket.getRefundAmount(), ticket.getCurrency())));
        log.info(
                "[AFTERSALE] 售后退款, orderId={}, ticketId={}, amount={}",
                ticket.getOrderId(),
                ticket.getId(),
                ticket.getRefundAmount());
    }

    /**
     * 转移的唯一落点：条件更新（WHERE status = action.from()）→ 影响行数闸门 → 时间线 → 写回订单投影。
     * extraSets 承载该动作附带的列（回寄填物流单、退款填时刻）。
     */
    private void transition(
            Ticket ticket, TicketAction action, String note, Consumer<LambdaUpdateWrapper<Ticket>> extraSets) {
        LambdaUpdateWrapper<Ticket> update = new LambdaUpdateWrapper<Ticket>()
                .eq(Ticket::getId, ticket.getId())
                .eq(Ticket::getStatus, action.from())
                .set(Ticket::getStatus, action.target());
        extraSets.accept(update);
        Validate.isTrue(ticketMapper.update(null, update) == 1, 409, action.conflictMessage());
        record(ticket, action, note);
        orderCommand.syncAfterSale(
                ticket.getOrderId(),
                action.target().name(),
                action.target() == TicketStatus.REFUNDED ? ticket.getRefundAmount() : null);
    }

    private void record(Ticket ticket, TicketAction action, String note) {
        ticketEventMapper.insert(TicketEvent.builder()
                .ticketId(ticket.getId())
                .actor(action.actor().name())
                .action(action.name())
                .note(note)
                .build());
    }

    /** 进行中的单：没有 → 409（用该动作的冲突文案）；不属于该买家 → 404，不泄露单据存在性 */
    private Ticket requireBuyerOpen(UUID userId, UUID orderId, TicketAction action) {
        Ticket ticket = requireOpen(orderId, action);
        Validate.isTrue(ticket.getUserId().equals(userId), 404, "订单不存在");
        return ticket;
    }

    private Ticket requireSellerOpen(UUID shopId, UUID orderId, TicketAction action) {
        Ticket ticket = requireOpen(orderId, action);
        Validate.isTrue(ticket.getShopId().equals(shopId), 404, "订单不存在");
        return ticket;
    }

    private Ticket requireOpen(UUID orderId, TicketAction action) {
        Ticket ticket = ticketMapper.selectOpenByOrder(orderId);
        Validate.isTrue(ticket != null, 409, action.conflictMessage());
        return ticket;
    }
}
