package com.shop.platform.logistics.service;

import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.logistics.api.ShipmentFactsQuery;
import com.shop.platform.logistics.mapper.Carrier;
import com.shop.platform.logistics.mapper.CarrierMapper;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentLine;
import com.shop.platform.logistics.mapper.ShipmentLineMapper;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.mapper.TrackingNode;
import com.shop.platform.logistics.mapper.TrackingNodeMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderShipmentLineView;
import com.shop.platform.order.api.OrderShipmentView;
import com.shop.platform.shop.api.AddressSnapshot;
import com.shop.platform.shop.api.MerchantAddressReadQuery;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 发货与物流查询 —— 发货的两步（录单 → 交寄）与取消都在这里。
 *
 * <p>为什么是两步（docs/domain/order-model.md §4.4）：录单只定格「这批行装哪个包裹、走哪家承运商」，
 * 货还没离开卖家，因此<b>不占</b>订单行的有效发货量；交寄才是货离手的时刻，从那一刻起累计发货量、
 * 重算子订单履约态。承运商揽收推送会替卖家自动交寄，所以卖家忘了点也不会卡住。
 *
 * <p>依赖方向是「logistics 经 {@code order :: api} 命令推进订单」（单向，不成环），
 * 同事务是硬约束：包裹落不下则订单不推进，订单推不进则包裹回滚——绝不出现「有包裹但订单已取消」。
 *
 * <p>归属用包裹/订单自己的 shop_id 判定，越权与不存在给 404 同一句话术（不泄露存在性）。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ShipmentService {

    private final ShipmentMapper shipmentMapper;

    private final ShipmentLineMapper shipmentLineMapper;

    private final TrackingNodeMapper trackingNodeMapper;

    private final CarrierMapper carrierMapper;

    /** 承运商解析（与买家回寄共用同一口径） */
    private final CarrierResolver carrierResolver;

    /** 订单只读视图：发货前置校验（归属 / 可发货）与行账本 —— 状态词表归 order，本模块只吃谓词 */
    private final OrderReadQuery orderReadQuery;

    /** 订单履约命令：交寄 / 取消 / 签收都在同一事务内推进子订单（同事务） */
    private final OrderCommand orderCommand;

    /** 商家发货地址（面单寄件人）只读解析：没配默认发货地址就硬失败，不猜地址 */
    private final MerchantAddressReadQuery merchantAddressReadQuery;

    /** 发货事实：交寄/取消/签收后的履约重算输入，与退款的履约重算共用同一个出口 */
    private final ShipmentFactsQuery shipmentFactsQuery;

    /**
     * 录单：落一张「待发货」包裹 + 发货单行，不动订单行的发货量。
     *
     * <p>行级守卫在这里先做一次（数量不超过可发量），真正的闸门在交寄时的那条条件更新——
     * 两张单并发时只有一张能过。
     */
    @Transactional
    public UUID record(DispatchShipmentCommand command) {
        // 1. 订单前置：不存在给 404；归属先于一切（不泄露他店订单是否存在），状态不可发（已取消/已完成/未付款）给 409
        OrderShipmentView order = Validate.presentOwned(
                orderReadQuery.shipmentViewById(command.orderId()),
                OrderShipmentView::shopId,
                command.shopId(),
                "订单不存在");
        Validate.conflict(order.shippable(), "订单当前状态不可发货");

        // 2. 行级校验：行属于该单、同一行只出现一次、数量不超过该行还能发的件数
        List<DispatchShipmentCommand.Line> lines = verifiedLines(command.orderId(), command.lines());

        // 3. 承运商：code 走字典并校验启用（不存在/已停用就是 400）——卖家路径必须给 code，没有名字兜底
        String carrierName = carrierResolver.resolveName(command.carrierCode());

        // 4. 一张单同一时刻只能有一张待发货包裹：库里部分唯一索引兜底，这里先给一句人话
        Validate.conflict(shipmentMapper.selectPendingOfOrder(command.orderId()) == null, "该订单已有待发货的发货单，请先交寄或取消");

        // 5. 寄件人快照：发货无地址即硬失败（面单寄不出去），在包裹上定格
        AddressSnapshot shipFrom =
                Validate.present(merchantAddressReadQuery.resolveShipFrom(command.shopId()), 400, "请先设置默认发货地址");

        // 6. 落包裹：唯一索引兜底重复运单号（一个运单号只属于一个订单）
        Shipment shipment = Shipment.builder()
                .orderId(command.orderId())
                .userId(order.userId())
                .shopId(command.shopId())
                .direction(ShipmentDirection.FORWARD)
                .carrierCode(command.carrierCode())
                .carrierName(carrierName)
                .trackingNo(command.trackingNo())
                .status(ShipmentStatus.PENDING_DISPATCH)
                .shipFromContactName(shipFrom.contactName())
                .shipFromPhone(shipFrom.phone())
                .shipFromProvince(shipFrom.province())
                .shipFromCity(shipFrom.city())
                .shipFromDistrict(shipFrom.district())
                .shipFromDetail(shipFrom.detail())
                .shipFromCompanyName(shipFrom.companyName())
                .build();
        // 先查后插挡不住并发，唯一索引才是真相：撞键即该运单号已被别的订单用过
        DuplicateKeys.conflictOnDuplicate(() -> shipmentMapper.insert(shipment), "该运单号已录入，请核对后重试");

        // 7. 发货单行：包裹里装了哪些订单行的多少件
        for (DispatchShipmentCommand.Line line : lines) {
            shipmentLineMapper.insert(ShipmentLine.builder()
                    .shipmentId(shipment.getId())
                    .orderItemId(line.orderItemId())
                    .quantity(line.quantity())
                    .build());
        }
        return shipment.getId();
    }

    /**
     * 交寄：待发货 → 已发出。写订单的物流摘要与发货时刻，把本次件数累加进行账本，再按事实重算履约态。
     * 重复交寄 / 已取消给 409，绝不重复入账。
     */
    @Transactional
    public void dispatch(UUID shopId, UUID shipmentId) {
        // 1. 归属：非本店与不存在同为 404
        Shipment shipment =
                Validate.requireOwned(shipmentMapper.selectById(shipmentId), Shipment::getShopId, shopId, "包裹不存在");

        // 2. 订单仍可发：录单之后订单可能被取消/已完成
        OrderShipmentView order = Validate.presentOwned(
                orderReadQuery.shipmentViewById(shipment.getOrderId()), OrderShipmentView::shopId, shopId, "订单不存在");
        Validate.conflict(order.shippable(), "订单当前状态不可发货");

        // 3. 状态闸门：条件更新抢不到（已交寄/已取消）即 409
        OffsetDateTime now = OffsetDateTime.now();
        Validate.conflict(shipmentMapper.markDispatched(shipmentId, shopId, now) == 1, "包裹已取消或已交寄");

        // 4. 订单侧事实（同事务）：摘要投影 + 首次发货窗口
        orderCommand.recordShipment(
                shipment.getOrderId(), shopId, shipment.getCarrierName(), shipment.getTrackingNo(), now);

        // 5. 行账本入账：守卫不满足（超发）抛 409 让整张包裹回滚
        orderCommand.applyShippedQuantity(shipment.getOrderId(), quantityByItem(shipmentId));

        // 6. 履约态重算：部分发货 / 已发货都由行账本算出来
        orderCommand.recalcFulfillment(shipment.getOrderId(), shipmentFactsQuery.forwardFacts(shipment.getOrderId()));
    }

    /**
     * 取消包裹：待发货取消只释放「一单一张待发货」的名额；已发出取消会把有效发货量退回来。
     * 已签收不可取消（货已经在买家手上，退货走退款单）。
     */
    @Transactional
    public void cancel(UUID shopId, UUID shipmentId) {
        // 1. 归属：非本店与不存在同为 404
        Shipment shipment =
                Validate.requireOwned(shipmentMapper.selectById(shipmentId), Shipment::getShopId, shopId, "包裹不存在");

        // 2. 条件转移带回前态：待发货没占过量，已发出才需要回退
        ShipmentStatus previous = shipmentMapper.cancelReturningPrevious(shipmentId, shopId, OffsetDateTime.now());
        Validate.conflict(previous != null, "包裹已签收或已取消，不可取消");
        rollBackIfShipped(shipment, previous);
    }

    /**
     * 承运商退回：轨迹推进到「已退回」时调用（同事务）。退回意味着货不会再送到买家，
     * 已发出的量退回未发件（§8「拒收 / 拦截 / 丢件」的第一步）；钱怎么退由售后单决定，不在物流里。
     *
     * <p>已签收的包裹不理会退回节点（签收是更权威的事实），不抛异常——一次迟到的推送不该让轨迹落库失败。
     */
    @Transactional
    public void cancelByCarrier(Shipment shipment, OffsetDateTime returnedAt) {
        ShipmentStatus previous =
                shipmentMapper.cancelReturningPrevious(shipment.getId(), shipment.getShopId(), returnedAt);
        if (previous == null) {
            return;
        }
        rollBackIfShipped(shipment, previous);
    }

    /**
     * 承运商揽收：轨迹证明货已离手时替卖家自动交寄（同事务）。卖家忘了点「交寄」不会把单卡住。
     *
     * <p>订单已不可发货（被取消 / 已完成）时只把包裹记成已发出，<b>不再动订单账本</b>——
     * 那张单已经不在履约里，往它上面加发货量只会让终态的单出现发货记录。不抛异常：轨迹是事实，
     * 不该因为联动对象已终结而落不了库。
     */
    @Transactional
    public void dispatchByCarrier(Shipment shipment, OffsetDateTime shippedAt) {
        if (shipmentMapper.markDispatched(shipment.getId(), shipment.getShopId(), shippedAt) != 1) {
            return;
        }
        OrderShipmentView order =
                orderReadQuery.shipmentViewById(shipment.getOrderId()).orElse(null);
        if (order == null || !order.shippable()) {
            log.info(
                    "[LOGISTICS] 订单已不在履约中，包裹记为已发出但不入账, shipmentId={}, orderId={}",
                    shipment.getId(),
                    shipment.getOrderId());
            return;
        }
        orderCommand.recordShipment(
                shipment.getOrderId(),
                shipment.getShopId(),
                shipment.getCarrierName(),
                shipment.getTrackingNo(),
                shippedAt);
        orderCommand.applyShippedQuantity(shipment.getOrderId(), quantityByItem(shipment.getId()));
        orderCommand.recalcFulfillment(shipment.getOrderId(), shipmentFactsQuery.forwardFacts(shipment.getOrderId()));
    }

    /**
     * 签收：已发出 → 已签收。由轨迹落库路径在「签收」节点上调用（同事务），
     * 重复签收与已取消包裹是无副作用的幂等返回。签收不改变发货量，只改变「全部签收」这个事实。
     */
    @Transactional
    public void deliver(Shipment shipment, OffsetDateTime signedAt) {
        if (shipmentMapper.markDelivered(shipment.getId(), signedAt) != 1) {
            return;
        }
        orderCommand.recalcFulfillment(shipment.getOrderId(), shipmentFactsQuery.forwardFacts(shipment.getOrderId()));
    }

    /** 可选承运商（发货下拉） */
    public List<Carrier> enabledCarriers() {
        return carrierMapper.selectEnabled();
    }

    /**
     * 买家查某订单的物流轨迹：一单多包裹（含逆向回寄），逐个带轨迹节点。
     * 未发货（或物流模块上线前的历史单）与越权访问给同一句话术、同一个 404——不泄露他单是否存在。
     */
    public OrderTracking trackingOfOrder(UUID userId, UUID orderId) {
        List<Shipment> shipments = shipmentMapper.selectByOrderAndUser(orderId, userId);
        Validate.present(!shipments.isEmpty(), "暂无物流信息");
        // 一次取全部包裹的轨迹再分组：逐包裹点查在一单多包裹（含退货回寄）时就是 N+1
        Map<UUID, List<TrackingNode>> nodesByShipment = trackingNodeMapper.groupedByShipments(
                shipments.stream().map(Shipment::getId).toList());
        return new OrderTracking(
                orderId,
                shipments.stream()
                        .map(s -> new ShipmentTracking(s, nodesByShipment.getOrDefault(s.getId(), List.of())))
                        .toList());
    }

    // ---- 私有：行校验与事实汇总 ----

    /** 取消之后的账本与重算（卖家取消与承运商退回共用）：已发出才需要回退有效发货量 */
    private void rollBackIfShipped(Shipment shipment, ShipmentStatus previous) {
        if (previous.countsTowardShipped()) {
            orderCommand.rollbackShippedQuantity(shipment.getOrderId(), quantityByItem(shipment.getId()));
        }
        orderCommand.recalcFulfillment(shipment.getOrderId(), shipmentFactsQuery.forwardFacts(shipment.getOrderId()));
    }

    /** 录单行校验：行属于该单、不重复、数量 ≤ 该行还能发的件数（settled_quantity 是唯一判据） */
    private List<DispatchShipmentCommand.Line> verifiedLines(
            UUID orderId, List<DispatchShipmentCommand.Line> requested) {
        Validate.isTrue(!requested.isEmpty(), "请选择要发货的商品");
        Map<UUID, OrderShipmentLineView> items = orderReadQuery.shipmentLinesById(orderId).stream()
                .collect(Collectors.toMap(OrderShipmentLineView::orderItemId, Function.identity()));
        Set<UUID> seen = new HashSet<>();
        for (DispatchShipmentCommand.Line line : requested) {
            Validate.isTrue(seen.add(line.orderItemId()), "同一订单行在一张发货单里只能出现一次");
            OrderShipmentLineView item = items.get(line.orderItemId());
            Validate.isTrue(item != null, "订单行不属于该订单");
            Validate.isTrue(line.quantity() > 0, "发货件数必须大于 0");
            Validate.conflict(line.quantity() <= item.shippableQuantity(), "发货数量超过该行的可发量");
        }
        return requested;
    }

    /** 包裹里的行 → 件数（交寄入账、取消回退共用） */
    private Map<UUID, Integer> quantityByItem(UUID shipmentId) {
        return shipmentLineMapper.selectByShipmentId(shipmentId).stream()
                .collect(Collectors.toMap(ShipmentLine::getOrderItemId, ShipmentLine::getQuantity));
    }
}
