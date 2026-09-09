package com.shop.platform.order.service;

import static com.shop.platform.order.model.OrderStatus.CANCELLED;
import static com.shop.platform.order.model.OrderStatus.COMPLETED;
import static com.shop.platform.order.model.OrderStatus.PAID;
import static com.shop.platform.order.model.OrderStatus.PENDING_PAYMENT;
import static com.shop.platform.order.model.OrderStatus.SHIPPED;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.dto.ShipOrderRequest;
import com.shop.platform.order.events.OrderCancelledEvent;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.order.model.OrderAction;
import com.shop.platform.order.model.OrderActor;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.OrderTimeouts;
import com.shop.platform.product.api.ProductCommand;
import com.shop.platform.shop.api.AddressSnapshot;
import com.shop.platform.shop.api.MerchantAddressReadQuery;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 订单状态变更的唯一去处 —— 买家、卖家、系统三类发起方的单笔事务落点。查询与下单在 {@link OrderService}。
 *
 * <p>转移合法性（状态集与转移表）定义在 {@code order.model} 的 {@link OrderStatus}（履约主线）；
 * 售后线已独立为 aftersale 模块（AfterSaleService），不在本类。本类只负责驱动：归属校验 → 条件更新（WHERE 源态 IN
 * sourcesOf(目标态)，影响行数即并发闸门）→ 库存/退款协同 → 审计流水。
 *
 * <p>同一目标态的多个入口共用一个私有落点，行为差异只在参数上：取消收在 {@link #cancelFrom}
 * （买家取消 / 待付款超时 / 待发货超时，各给不同的合法源态集与审计动作），完成收在 {@link #complete}
 * （买家确认收货 / 超时自动收货）。
 * 买家入口抢不到转移报 409，系统入口返回 false 让位——正确性不依赖加锁。
 *
 * <p>超时批量扫描（非事务）在 {@link OrderTimeoutService}：与本类的单笔事务方法分属两个 bean，
 * 规避 Spring 自调用导致 @Transactional 失效。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderTransitionService {

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final StockCommand stockCommand;

    /** 商品销量投影命令：完成时把行项成交量累加进 product（product::api，同事务） */
    private final ProductCommand productCommand;

    private final OrderStatusLogWriter statusLogWriter;

    private final ApplicationEventPublisher events;

    /** 商家发货地址快照查询：发货时解析默认发货地址（shop::api，只读），无默认即拒绝发货 */
    private final MerchantAddressReadQuery merchantAddressReadQuery;

    // ========== 履约主状态机：买家 ==========

    /** 买家取消：仅待付款/待发货可取消（源态由状态机反推），库存与退款按真实前态分流 */
    @Transactional
    public void cancel(UUID userId, UUID orderId, String reason) {
        Order order = orderMapper.requireOwned(userId, orderId);
        boolean cancelled =
                cancelFrom(order, OrderStatus.sourcesOf(CANCELLED), reason, OrderAction.CANCEL, OrderActor.BUYER);
        Validate.isTrue(cancelled, 409, "订单状态已变更，当前不可取消");
    }

    /** 确认收货：已发货 → 已完成，同时开通售后申请窗口 */
    @Transactional
    public void receive(UUID userId, UUID orderId) {
        orderMapper.requireOwned(userId, orderId);
        boolean completed = complete(orderId, OrderAction.RECEIVE, OrderActor.BUYER);
        Validate.isTrue(completed, 409, "订单状态已变更，当前不可确认收货");
    }

    // ========== 履约主状态机：卖家 ==========

    /** 发货：待发货 → 已发货，回填物流信息（一单一包裹）与确认收货截止 */
    @Transactional
    public void ship(UUID shopId, UUID orderId, ShipOrderRequest req) {
        // 0. 归属先于一切：不存在/非本店给 404，不让「请先设置默认发货地址」泄露他店订单是否存在
        Order existing = orderMapper.selectById(orderId);
        if (existing == null || !existing.getShopId().equals(shopId)) {
            throw BusinessException.notFound("订单不存在");
        }
        // 0.5 发货快照：解析本店默认发货地址（shop::api）。发货无寄件人即硬失败——不静默兜底、不猜地址
        AddressSnapshot shipper = Validate.present(merchantAddressReadQuery.resolveShipFrom(shopId), 400, "请先设置默认发货地址");
        // 1. 条件转移：限定本店 + 状态机反推的源状态，错态在影响行数上暴露；发货快照在此定格
        OffsetDateTime now = OffsetDateTime.now();
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .eq(Order::getShopId, shopId)
                        .in(Order::getStatus, OrderStatus.sourcesOf(SHIPPED))
                        .set(Order::getStatus, SHIPPED)
                        .set(Order::getShippedAt, now)
                        .set(Order::getReceiveExpireAt, now.plus(OrderTimeouts.RECEIVE))
                        .set(Order::getLogisticsCompany, req.logisticsCompany())
                        .set(Order::getTrackingNo, req.trackingNo())
                        .set(Order::getShipperContactName, shipper.contactName())
                        .set(Order::getShipperPhone, shipper.phone())
                        .set(Order::getShipperProvince, shipper.province())
                        .set(Order::getShipperCity, shipper.city())
                        .set(Order::getShipperDistrict, shipper.district())
                        .set(Order::getShipperDetail, shipper.detail())
                        .set(Order::getShipperCompanyName, shipper.companyName()));
        if (affected == 1) {
            statusLogWriter.record(orderId, PAID, SHIPPED, OrderAction.SHIP, OrderActor.SELLER, null);
            return;
        }
        // 2. 归属已在步骤 0 过门，抢不到转移只剩状态不对
        throw new BusinessException(409, "订单不是待发货状态");
    }

    // ========== 履约主状态机：系统超时（单笔事务落点，批量扫描见 OrderTimeoutService） ==========

    /** 待付款超时关单：只认 PENDING_PAYMENT，释放冻结库存（前态必未付款，故不发退款事件） */
    @Transactional
    public boolean closeUnpaid(Order order) {
        return cancelFrom(order, Set.of(PENDING_PAYMENT), "超时未支付，自动关闭", OrderAction.AUTO_CANCEL, OrderActor.SYSTEM);
    }

    /** 待发货超时自动取消：只认 PAID，回补总库存并落退款单据 */
    @Transactional
    public boolean cancelUnshipped(Order order) {
        return cancelFrom(order, Set.of(PAID), "超时未发货，自动取消并退款", OrderAction.AUTO_CANCEL, OrderActor.SYSTEM);
    }

    /** 已发货超时未确认：自动确认收货（无库存/退款动作） */
    @Transactional
    public boolean completeUnreceived(Order order) {
        return complete(order.getId(), OrderAction.AUTO_RECEIVE, OrderActor.SYSTEM);
    }

    // ========== 私有：两个共用落点 ==========

    /**
     * 取消的唯一落点（买家取消 / 待付款超时 / 待发货超时共用）。
     *
     * @param sources 各入口刻意不同的合法前态集：买家两态皆可取消，系统各只认自己那一态
     * @return 是否真的改到了行；抢不到（已支付/已发货/已关闭）由调用方决定报 409 还是让位
     */
    private boolean cancelFrom(
            Order order, Set<OrderStatus> sources, String reason, OrderAction action, OrderActor actor) {
        // 1. 行项目先取：转移不改行项，先取免二次判断
        List<OrderItem> items = orderItemMapper.selectByOrderId(order.getId());

        // 2. 条件转移并取回前态（RETURNING OLD）：库存回退方向取决于真实前态，不能靠 CAS 前的陈旧读
        String trimmed = reason == null || reason.isBlank() ? null : reason.trim();
        OrderStatus previous =
                orderMapper.cancelReturningPrevious(order.getId(), sources, OffsetDateTime.now(), trimmed);
        if (previous == null) {
            return false;
        }

        // 3. 付款后取消：库存已扣实 → 回补总库存，且必须留下退款单据（payment 同步监听，同事务 → 取消不成则退款不落）
        if (previous == PAID) {
            stockCommand.restock(order.getId(), toStockLines(items));
            events.publishEvent(new OrderCancelledEvent(order.getId(), order.getUserId()));
        } else {
            // 付款前取消：只释放冻结（frozen → 可用）
            stockCommand.release(order.getId(), toStockLines(items));
        }

        statusLogWriter.record(order.getId(), previous, CANCELLED, action, actor, trimmed);
        log.info("[ORDER] 订单取消, orderId={}, 前态={}, 发起方={}", order.getId(), previous, actor);
        return true;
    }

    /** 完成的唯一落点（买家确认收货 / 超时自动收货共用）：转 COMPLETED 并开通售后申请窗口 */
    private boolean complete(UUID orderId, OrderAction action, OrderActor actor) {
        OffsetDateTime now = OffsetDateTime.now();
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .in(Order::getStatus, OrderStatus.sourcesOf(COMPLETED))
                        .set(Order::getStatus, COMPLETED)
                        .set(Order::getCompletedAt, now)
                        .set(Order::getApplyExpireAt, now.plus(OrderTimeouts.AFTER_SALE_APPLY)));
        if (affected != 1) {
            return false;
        }
        statusLogWriter.record(orderId, SHIPPED, COMPLETED, action, actor, null);
        // 销量投影：完成即成交，同事务经 product :: api 累加（同 SPU 多 SKU 先合并；口径见 ProductCommand）
        productCommand.addSold(orderItemMapper.selectByOrderId(orderId).stream()
                .collect(Collectors.toMap(OrderItem::getProductId, OrderItem::getQuantity, Integer::sum)));
        return true;
    }

    // ========== 私有：更新辅助 ==========

    /** 更新起点：主键定位 + 影响行数即乐观闸门 */
    private static LambdaUpdateWrapper<Order> condition(UUID orderId) {
        return new LambdaUpdateWrapper<Order>().eq(Order::getId, orderId);
    }

    /** 订单行 → 库存结算行（回补/释放共用） */
    private static List<StockLine> toStockLines(List<OrderItem> items) {
        return items.stream()
                .map(i -> new StockLine(i.getSkuId(), i.getQuantity()))
                .toList();
    }
}
