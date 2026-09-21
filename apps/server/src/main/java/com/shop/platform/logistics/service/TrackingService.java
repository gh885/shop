package com.shop.platform.logistics.service;

import static com.shop.platform.logistics.model.ShipmentStatus.DELIVERED;

import com.github.f4b6a3.uuid.UuidCreator;
import com.shop.platform.common.Validate;
import com.shop.platform.logistics.dto.TrackingNodeRequest;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.mapper.TrackingNode;
import com.shop.platform.logistics.mapper.TrackingNodeMapper;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.order.api.OrderCommand;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 轨迹写入 —— 承运商推进入口的唯一落点（现阶段由平台运营补录）。
 *
 * <p>两条不变式在这里落地，且都由库约束兜底而非靠调用方守规矩：<b>节点不重复</b>（dedupe_key 唯一索引）、
 * <b>状态只前进</b>（条件更新 WHERE status IN sourcesOf(target)）。乱序、迟到、重推都是常态，不是异常。
 *
 * <p>签收是唯一会牵动订单的节点：推进到 DELIVERED 时经 {@code order :: api} 把签收时刻写进订单
 * （同事务），让「确认收货倒计时」从签收起算；订单侧只认 SHIPPED + 未签收，重复签收幂等。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TrackingService {

    private final ShipmentMapper shipmentMapper;

    private final TrackingNodeMapper trackingNodeMapper;

    /** 签收回写命令：物流事实落到订单投影，由 order 自己重算收货窗口 */
    private final OrderCommand orderCommand;

    /** 包裹到终态时结掉未结异常单：异常不再需要人处理，留着就是假待办 */
    private final ShipmentIssueService shipmentIssueService;

    /**
     * 录入一条轨迹节点：去重落库 + 单调推进包裹状态。重复推送与迟到节点都是幂等的无副作用返回。
     *
     * @return 是否真的落了一条新节点（false = 同一事实已记录过）。调用方用它计数/打日志——
     *     "收到 3 条、新增 1 条"比"处理了 3 条"信息量大得多，也是排查推送重复率的依据
     */
    @Transactional
    public boolean recordNode(UUID shipmentId, TrackingNodeRequest req) {
        // 1. 定位包裹：不存在给 404（越权由调用侧的权限闸门负责，这里是运营补录入口）
        Shipment shipment = Validate.notNull(shipmentMapper.selectById(shipmentId), "包裹不存在");

        // 2. 归一化：节点码 → 目标状态。这是状态推导的唯一入口，承运商原始码不进领域
        ShipmentStatus target = req.nodeCode().status();

        // 3. 去重落库：撞唯一键 = 同一事实已记录过（重推/补录），静默返回，状态不动
        int inserted = trackingNodeMapper.insertIgnoreDuplicate(TrackingNode.builder()
                .id(UuidCreator.getTimeOrderedEpoch())
                .shipmentId(shipmentId)
                .nodeCode(req.nodeCode())
                .description(req.description())
                .location(req.location())
                .occurredAt(req.occurredAt())
                .dedupeKey(TrackingNode.dedupeKey(shipmentId, req.nodeCode(), req.occurredAt(), req.location()))
                .build());
        if (inserted == 0) {
            log.debug("[LOGISTICS] 轨迹节点重复，忽略, shipmentId={}, nodeCode={}", shipmentId, req.nodeCode());
            return false;
        }

        // 4. 单调推进：抢不到（终态更靠后 / 该节点比当前状态旧）就是乱序或迟到，只落库不改状态
        int advanced = shipmentMapper.advanceStatus(shipmentId, target, target == DELIVERED ? req.occurredAt() : null);

        // 5. 终态的两件收尾（同事务）：签收回写订单 + 结掉未结异常单
        if (advanced == 1 && target == DELIVERED) {
            orderCommand.markDelivered(shipment.getOrderId(), req.occurredAt());
        }
        if (advanced == 1 && target.terminal()) {
            shipmentIssueService.resolveOnTerminal(shipmentId, "包裹已到终态（" + target + "），异常自动结单");
        }

        log.info(
                "[LOGISTICS] 轨迹节点落库, shipmentId={}, nodeCode={}, 状态推进={}",
                shipmentId,
                req.nodeCode(),
                advanced == 1 ? target : "保持（旧节点或终态已到）");
        return true;
    }
}
