package com.shop.platform.logistics.api;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.service.CarrierResolver;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 退货回寄命令（跨模块消费）——aftersale 在买家填回寄物流单时同步调用。
 *
 * <p>同事务：售后单的时间线与回寄包裹一起成或一起败。包裹用 {@link ShipmentDirection#RETURN} 与正向区分，
 * 之后它自动享有正向的一切——承运商推送按运单号就能匹配到它（{@code selectByTrackingNo} 不看方向）、
 * 轮询扫描不看方向、买家查订单物流时两个方向的包裹一起返回。这就是"逆向复用同一套模型"的全部含义。
 *
 * <p>面单寄件人（{@code ship_from_*}）逆向不填：回寄面单是买家在线下/快递网点填的，
 * 平台没有也不该有这份数据。买家收货地址在订单快照里，不在这里复制一份。
 */
@Component
@RequiredArgsConstructor
public class ReturnShipmentCommand {

    private final ShipmentMapper shipmentMapper;

    /** 承运商名称与卖家发货同口径（命中字典用字典名，否则保留原文） */
    private final CarrierResolver carrierResolver;

    /**
     * 记一次退货回寄。
     *
     * @param carrierName 承运商名称（买家手填）；与 carrierCode 二者至少要有一个
     * @return 落成的包裹（含归一后的承运商名与运单号）
     */
    @Transactional
    public ReturnShipmentView record(
            UUID orderId, UUID userId, UUID shopId, String carrierCode, String carrierName, String trackingNo) {
        String resolvedName = carrierResolver.resolveName(carrierCode, carrierName);
        Shipment shipment = Shipment.builder()
                .orderId(orderId)
                .userId(userId)
                .shopId(shopId)
                .direction(ShipmentDirection.RETURN)
                .carrierCode(carrierCode)
                .carrierName(resolvedName)
                .trackingNo(trackingNo)
                // 回寄包裹起步就是"已寄出"：买家填单号时包裹已经在他手里交给承运商了
                .status(ShipmentStatus.PICKED_UP)
                .shippedAt(OffsetDateTime.now())
                .build();
        try {
            shipmentMapper.insert(shipment);
        } catch (DuplicateKeyException e) {
            // 一个运单号只属于一个包裹：拿别人的回寄单号来填是常见误操作（也可能是撞库式试探）
            throw new BusinessException(409, "该运单号已被使用，请核对后重填");
        }
        return new ReturnShipmentView(
                shipment.getId(), shipment.getCarrierCode(), shipment.getCarrierName(), shipment.getTrackingNo());
    }
}
