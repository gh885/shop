package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShipmentMapper extends BaseMapper<Shipment> {

    /**
     * 买家查自己的正向包裹：归属（user_id）与方向（FORWARD）都进 WHERE，
     * 查无此包裹与越权访问返回同一个结果——不泄露他单存在性，与 order 的 requireOwned 同一意图。
     */
    default Shipment selectForwardByOrder(UUID orderId, UUID userId) {
        return selectOne(new LambdaQueryWrapper<Shipment>()
                .eq(Shipment::getOrderId, orderId)
                .eq(Shipment::getUserId, userId)
                .eq(Shipment::getDirection, ShipmentDirection.FORWARD));
    }

    /**
     * 按轨迹节点单调推进状态：合法前态集由 {@link ShipmentStatus#sourcesOf} 反推，影响行数即闸门。
     * 抢不到（已签收/已退回，或该节点不比当前状态靠后）= 迟到或乱序的旧节点，只落库不改状态，返回 0。
     *
     * @param deliveredAt 仅在目标态为 DELIVERED 时传入（回填签收时刻），否则 null 不动该列
     */
    default int advanceStatus(UUID shipmentId, ShipmentStatus target, OffsetDateTime deliveredAt) {
        LambdaUpdateWrapper<Shipment> update = new LambdaUpdateWrapper<Shipment>()
                .eq(Shipment::getId, shipmentId)
                .in(Shipment::getStatus, ShipmentStatus.sourcesOf(target))
                .set(Shipment::getStatus, target);
        if (deliveredAt != null) {
            update.set(Shipment::getDeliveredAt, deliveredAt);
        }
        return update(null, update);
    }
}
