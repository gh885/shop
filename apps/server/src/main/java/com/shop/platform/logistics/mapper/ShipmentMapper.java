package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShipmentMapper extends BaseMapper<Shipment> {

    /**
     * 买家查自己的包裹列表（一单可多包裹）：归属（user_id）与方向（FORWARD）都进 WHERE，
     * 越权与无包裹同样返回空列表——不泄露他单存在性，与 order 的 requireOwned 同一意图。
     * 按发货先后返回，首项即订单摘要里的那个包裹。
     */
    default List<Shipment> selectForwardByOrder(UUID orderId, UUID userId) {
        return selectList(new LambdaQueryWrapper<Shipment>()
                .eq(Shipment::getOrderId, orderId)
                .eq(Shipment::getUserId, userId)
                .eq(Shipment::getDirection, ShipmentDirection.FORWARD)
                .orderByAsc(Shipment::getShippedAt)
                .orderByAsc(Shipment::getId));
    }

    /** 本店某订单的全部包裹（卖家发货作业视图） */
    default List<Shipment> selectByOrder(UUID orderId) {
        return selectList(new LambdaQueryWrapper<Shipment>()
                .eq(Shipment::getOrderId, orderId)
                .orderByAsc(Shipment::getShippedAt)
                .orderByAsc(Shipment::getId));
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
