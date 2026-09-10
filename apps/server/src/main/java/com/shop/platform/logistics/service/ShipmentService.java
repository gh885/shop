package com.shop.platform.logistics.service;

import com.shop.platform.common.Validate;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.mapper.TrackingNode;
import com.shop.platform.logistics.mapper.TrackingNodeMapper;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 物流轨迹查询 —— 买家/卖家读到的是同一个形状，差别只在归属闸门。
 *
 * <p>归属用包裹自己的 user_id / shop_id 判定，不回查订单（本模块对 order 出度为零）：
 * "发过货就一定有包裹、包裹一定认自己的买家和店铺"是落包裹时定下的不变式。
 */
@Service
@RequiredArgsConstructor
public class ShipmentService {

    private final ShipmentMapper shipmentMapper;

    private final TrackingNodeMapper trackingNodeMapper;

    /**
     * 买家查某订单的物流轨迹。
     *
     * <p>未发货（或物流模块上线前的历史单）与越权访问给同一句话术、同一个 404——不泄露他单是否存在。
     */
    public ShipmentTracking trackingOfOrder(UUID userId, UUID orderId) {
        Shipment shipment = Validate.notNull(shipmentMapper.selectForwardByOrder(orderId, userId), "暂无物流信息");
        List<TrackingNode> nodes = trackingNodeMapper.selectByShipment(shipment.getId());
        return new ShipmentTracking(shipment, nodes);
    }
}
