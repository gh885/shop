package com.shop.platform.logistics.service;

import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.logistics.mapper.Carrier;
import com.shop.platform.logistics.mapper.CarrierMapper;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.mapper.TrackingNodeMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderShipmentView;
import com.shop.platform.shop.api.AddressSnapshot;
import com.shop.platform.shop.api.MerchantAddressReadQuery;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 发货与物流查询 —— 发货的命令入口（二期从 order 搬来：发货本质是物流动作）。
 *
 * <p>依赖方向因此从「一期的事件」变成「api 命令」：本模块经 {@code order :: api} 的
 * {@link OrderCommand#markShipped} 推进订单状态，order 不再认识物流（仍是单向，不成环）。
 * 同事务是硬约束：包裹落不下则订单不推进，订单推不进则包裹回滚——绝不出现「有包裹但订单还是待发货」。
 *
 * <p>归属用包裹/订单自己的 shop_id 判定，越权与不存在给 404 同一句话术（不泄露存在性）。
 */
@Service
@RequiredArgsConstructor
public class ShipmentService {

    private final ShipmentMapper shipmentMapper;

    private final TrackingNodeMapper trackingNodeMapper;

    private final CarrierMapper carrierMapper;

    /** 承运商解析（与买家回寄共用同一口径） */
    private final CarrierResolver carrierResolver;

    /** 订单只读视图：发货前置校验（归属 / 可发货）——状态词表归 order，本模块只吃谓词 */
    private final OrderReadQuery orderReadQuery;

    /** 发货推进命令：把包裹已落这件事同步写进订单（同事务） */
    private final OrderCommand orderCommand;

    /** 商家发货地址（面单寄件人）只读解析：没配默认发货地址就硬失败，不猜地址 */
    private final MerchantAddressReadQuery merchantAddressReadQuery;

    /**
     * 发货：落一个包裹 + 推进订单状态。
     *
     * <p>可重复调用（一单多包裹）：首次把 PAID 推到 SHIPPED，之后只追加包裹并刷新订单上的物流摘要投影。
     */
    @Transactional
    public UUID dispatch(DispatchShipmentCommand command) {
        // 1. 订单前置：不存在给 404；归属先于一切（不泄露他店订单是否存在），状态不可发（已取消/已完成）给 409
        OrderShipmentView order = Validate.present(orderReadQuery.shipmentViewById(command.orderId()), "订单不存在");
        Validate.isTrue(order.shopId().equals(command.shopId()), 404, "订单不存在");
        Validate.isTrue(order.shippable(), 409, "订单当前状态不可发货");

        // 2. 承运商：code 走字典并校验启用（新端点）；老端点只有名字，匹配得上就归一，匹配不上保留原文
        String carrierName = carrierResolver.resolveName(command.carrierCode(), command.carrierName());

        // 3. 寄件人快照：发货无地址即硬失败（面单寄不出去），在包裹上定格
        AddressSnapshot shipFrom =
                Validate.present(merchantAddressReadQuery.resolveShipFrom(command.shopId()), 400, "请先设置默认发货地址");

        // 4. 落包裹：唯一索引兜底重复运单号（一个运单号只属于一个订单）
        Shipment shipment = Shipment.builder()
                .orderId(command.orderId())
                .userId(order.userId())
                .shopId(command.shopId())
                .direction(ShipmentDirection.FORWARD)
                .carrierCode(command.carrierCode())
                .carrierName(carrierName)
                .trackingNo(command.trackingNo())
                .status(ShipmentStatus.PENDING_PICKUP)
                .shippedAt(OffsetDateTime.now())
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

        // 5. 推进订单（同事务）：首次发货 PAID → SHIPPED 并落审计流水，追加包裹只刷新物流摘要投影
        orderCommand.markShipped(
                command.orderId(), command.shopId(), carrierName, command.trackingNo(), shipment.getShippedAt());
        return shipment.getId();
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
        Validate.isTrue(!shipments.isEmpty(), 404, "暂无物流信息");
        return new OrderTracking(
                orderId,
                shipments.stream()
                        .map(s -> new ShipmentTracking(s, trackingNodeMapper.selectByShipment(s.getId())))
                        .toList());
    }
}
