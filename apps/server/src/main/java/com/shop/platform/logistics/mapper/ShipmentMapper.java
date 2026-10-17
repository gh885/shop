package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.model.TrackingNodeCode;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface ShipmentMapper extends BaseMapper<Shipment> {

    /**
     * 买家查自己的包裹列表（一单可多包裹、含逆向回寄）：归属（user_id）进 WHERE，
     * 越权与无包裹同样返回空列表——不泄露他单存在性，与 order 的 requireOwned 同一意图。
     *
     * <p>不按方向过滤：买家在"查看物流"里既该看到正向派送，也该看到自己的退货回寄轨迹，
     * 方向由出参的 {@code direction} 字段交给前端区分（正向在前、逆向在后）。
     */
    default List<Shipment> selectByOrderAndUser(UUID orderId, UUID userId) {
        return selectList(new LambdaQueryWrapper<Shipment>()
                .eq(Shipment::getOrderId, orderId)
                .eq(Shipment::getUserId, userId)
                .orderByAsc(Shipment::getDirection)
                .orderByAsc(Shipment::getCreatedAt)
                .orderByAsc(Shipment::getId));
    }

    /** 按运单号取包裹（推送入口）：一个运单号只属于一个订单，唯一索引保证至多一行；无则 null */
    default Shipment selectByTrackingNo(String trackingNo) {
        return selectOne(new LambdaQueryWrapper<Shipment>().eq(Shipment::getTrackingNo, trackingNo));
    }

    /**
     * 一单在给定方向上的全部包裹（回寄改单要先旧后新，取的就是这一向的存量）。
     *
     * <p>不给排序口径：调用方是把取回的行整批作废再重建，谁先谁后不影响结果；
     * 有顺序要求的是买家「查看物流」那条列表，见 {@link #selectByOrderAndUser}。
     */
    default List<Shipment> selectByOrderAndDirection(UUID orderId, ShipmentDirection direction) {
        return selectList(new LambdaQueryWrapper<Shipment>()
                .eq(Shipment::getOrderId, orderId)
                .eq(Shipment::getDirection, direction));
    }

    /**
     * 一单的正向包裹：履约重算与发货守卫的唯一事实来源（逆向回寄不占发货量，不在这里）。
     * 按创建先后给出，重算取「最后签收时刻」时无需再排。
     */
    default List<Shipment> selectForwardByOrder(UUID orderId) {
        return selectList(new LambdaQueryWrapper<Shipment>()
                .eq(Shipment::getOrderId, orderId)
                .eq(Shipment::getDirection, ShipmentDirection.FORWARD)
                .orderByAsc(Shipment::getCreatedAt)
                .orderByAsc(Shipment::getId));
    }

    /** 该单当前那张「待发货」包裹；唯一索引保证至多一行，没有则 null */
    default Shipment selectPendingOfOrder(UUID orderId) {
        return selectOne(new LambdaQueryWrapper<Shipment>()
                .eq(Shipment::getOrderId, orderId)
                .eq(Shipment::getStatus, ShipmentStatus.PENDING_DISPATCH));
    }

    /**
     * 轮询候选：在途（已发出、未签收未取消）且最后一条节点（从未有节点则取交寄时刻）早于阈值的包裹。
     *
     * <p>用子查询而不是冗余"最后更新时间"列：轨迹是 append-only 事实，最大值即最新，没必要多一份可能不同步的副本。
     * 本查询是单 schema 内的自表关联，不跨模块。待发货不在候选里——货还没交出去，没有轨迹可拉。
     */
    @Select(
            """
            SELECT s.* FROM logistics.shipments s
            WHERE s.status = 'DISPATCHED'
              AND COALESCE(
                    (SELECT MAX(n.occurred_at) FROM logistics.tracking_nodes n WHERE n.shipment_id = s.id),
                    s.shipped_at) < #{staleBefore}
            ORDER BY s.shipped_at
            LIMIT #{limit}
            """)
    List<Shipment> selectStaleForPolling(@Param("staleBefore") OffsetDateTime staleBefore, @Param("limit") int limit);

    /**
     * 异常扫描候选（还没任何轨迹的）：已发出、一条节点都没有、交寄早于阈值的正向包裹——
     * 对应「超过 24 小时未揽收」。只看正向：回寄卡住由售后流程自己跟进。
     *
     * <p>本语句没有 {@code <script>} 外壳，所以比较符写裸的 {@code <}：只有 {@code <script>} 里的内容
     * 才会被 MyBatis 当 XML 解析（那里必须转义成 {@code &lt;}），裸注解里写转义实体反而会原样发给 PG。
     */
    @Select(
            """
            SELECT s.* FROM logistics.shipments s
            WHERE s.direction = 'FORWARD'
              AND s.status = 'DISPATCHED'
              AND NOT EXISTS (SELECT 1 FROM logistics.tracking_nodes n WHERE n.shipment_id = s.id)
              AND s.shipped_at < #{stalledBefore}
            ORDER BY s.shipped_at
            LIMIT #{limit}
            """)
    List<Shipment> selectStalledWithoutTracking(
            @Param("stalledBefore") OffsetDateTime stalledBefore, @Param("limit") int limit);

    /**
     * 异常扫描候选（停在某个轨迹阶段）：最后一条节点的节点码落在给定集合、且该节点时刻早于阈值。
     *
     * <p>注意 {@code <script>} 里的一切 {@code <} 都要写成 {@code &lt;}——MyBatis 会先把注解内容
     * 当 XML 解析，裸的比较符直接是语法错误（构建期就炸，不留到运行期）。
     */
    @Select(
            """
            <script>
            SELECT s.* FROM logistics.shipments s
            WHERE s.direction = 'FORWARD'
              AND s.status = 'DISPATCHED'
              AND (SELECT n.node_code FROM logistics.tracking_nodes n
                   WHERE n.shipment_id = s.id
                   ORDER BY n.occurred_at DESC, n.id DESC LIMIT 1) IN
              <foreach collection="nodeCodes" item="code" open="(" separator=", " close=")">#{code}</foreach>
              AND (SELECT MAX(n.occurred_at) FROM logistics.tracking_nodes n WHERE n.shipment_id = s.id) &lt; #{stalledBefore}
            ORDER BY s.shipped_at
            LIMIT #{limit}
            </script>
            """)
    List<Shipment> selectStalledAtNodes(
            @Param("nodeCodes") Collection<TrackingNodeCode> nodeCodes,
            @Param("stalledBefore") OffsetDateTime stalledBefore,
            @Param("limit") int limit);

    /**
     * 交寄：待发货 → 已发出并回填交寄时刻。影响行数即闸门——0 行 = 已被取消或已交寄过，调用方给 409。
     */
    default int markDispatched(UUID shipmentId, UUID shopId, OffsetDateTime shippedAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Shipment>()
                        .eq(Shipment::getId, shipmentId)
                        .eq(Shipment::getShopId, shopId)
                        .eq(Shipment::getStatus, ShipmentStatus.PENDING_DISPATCH)
                        .set(Shipment::getStatus, ShipmentStatus.DISPATCHED)
                        .set(Shipment::getShippedAt, shippedAt)
                        .set(Shipment::getUpdatedAt, shippedAt));
    }

    /**
     * 签收：已发出 → 已签收并回填签收时刻。0 行 = 已取消/已签收（迟到或重复的节点），只落轨迹不改状态。
     */
    default int markDelivered(UUID shipmentId, OffsetDateTime signedAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Shipment>()
                        .eq(Shipment::getId, shipmentId)
                        .eq(Shipment::getStatus, ShipmentStatus.DISPATCHED)
                        .set(Shipment::getStatus, ShipmentStatus.DELIVERED)
                        .set(Shipment::getSignedAt, signedAt)
                        .set(Shipment::getUpdatedAt, signedAt));
    }

    /**
     * 取消：待发货与已发出都可取消，已签收不可。经 PG18 RETURNING OLD 带回<b>取消前</b>的状态——
     * 前态决定要不要回退订单行的有效发货量（待发货没占过量，回退会是负数）。
     * 无行返回 = 已签收 / 已取消 / 不存在 / 非本店，调用方给 404 或 409。
     */
    @Select(
            """
            UPDATE logistics.shipments
            SET status = 'CANCELLED', cancelled_at = #{cancelledAt}, updated_at = #{cancelledAt}
            WHERE id = #{shipmentId}
              AND shop_id = #{shopId}
              AND status IN ('PENDING_DISPATCH', 'DISPATCHED')
            RETURNING OLD.status AS "previousStatus"
            """)
    ShipmentStatus cancelReturningPrevious(
            @Param("shipmentId") UUID shipmentId,
            @Param("shopId") UUID shopId,
            @Param("cancelledAt") OffsetDateTime cancelledAt);
}
