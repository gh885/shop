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
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

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

    /** 按运单号取包裹（推送入口）：一个运单号只属于一个订单，唯一索引保证至多一行；无则 null */
    default Shipment selectByTrackingNo(String trackingNo) {
        return selectOne(new LambdaQueryWrapper<Shipment>().eq(Shipment::getTrackingNo, trackingNo));
    }

    /**
     * 轮询候选：未到终态、且最后一条节点（从未有节点则取发货时刻）早于阈值的包裹。
     *
     * <p>用子查询而不是冗余"最后更新时间"列：轨迹是 append-only 事实，最大值即最新，没必要多一份可能不同步的副本。
     * 本查询是单 schema 内的自表关联，不跨模块。
     */
    @Select(
            """
            SELECT s.* FROM logistics.shipments s
            WHERE s.status NOT IN ('DELIVERED', 'RETURNED')
              AND COALESCE(
                    (SELECT MAX(n.occurred_at) FROM logistics.tracking_nodes n WHERE n.shipment_id = s.id),
                    s.shipped_at) < #{staleBefore}
            ORDER BY s.shipped_at
            LIMIT #{limit}
            """)
    List<Shipment> selectStaleForPolling(@Param("staleBefore") OffsetDateTime staleBefore, @Param("limit") int limit);

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
