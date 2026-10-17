package com.shop.platform.logistics.service;

import com.github.f4b6a3.uuid.UuidCreator;
import com.shop.platform.account.api.StaffReadQuery;
import com.shop.platform.audit.api.AuditAction;
import com.shop.platform.audit.api.RecordAuditCommand;
import com.shop.platform.common.Validate;
import com.shop.platform.logistics.dto.TrackingNodeRequest;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.mapper.TrackingNode;
import com.shop.platform.logistics.mapper.TrackingNodeMapper;
import com.shop.platform.logistics.model.TrackingNodeCode;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 轨迹写入 —— 承运商推送 / 轮询 / 运营补录的唯一落点。
 *
 * <p>三条不变式在这里落地，且都由库约束兜底而非靠调用方守规矩：<b>节点不重复</b>（dedupe_key 唯一索引）、
 * <b>包裹状态是时间戳的镜像</b>（条件更新，改不到就是幂等）、<b>轨迹不因联动失败而丢</b>（联动只做能做成的事）。
 *
 * <p>节点码只触发三类事实，其余节点纯展示（阶段见 {@code TrackingStage}）：
 * <ul>
 *   <li><b>已动身</b>（揽收 / 中转 / 派送 / 签收 / 退回）⇒ 待发货的包裹自动交寄——承运商揽收就是卖家交寄的时刻；</li>
 *   <li><b>签收</b> ⇒ 已发出 → 已签收，子订单按事实重算（全部签收 + 全部结清 = 完成）；</li>
 *   <li><b>退回</b> ⇒ 取消包裹（有效发货量退回），钱走售后单，不在物流里退。</li>
 * </ul>
 * 异常节点只落轨迹，不进异常扫描的起始态——真异常由时间阈值判定（{@code ShipmentIssueType}）。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TrackingService {

    private final ShipmentMapper shipmentMapper;

    private final TrackingNodeMapper trackingNodeMapper;

    /** 包裹状态与订单履约的联动（交寄 / 签收 / 取消）都在这个 service 里，同事务 */
    private final ShipmentService shipmentService;

    /** 包裹到终态时结掉未结异常单：异常不再需要人处理，留着就是假待办 */
    private final ShipmentIssueService shipmentIssueService;

    private final RecordAuditCommand recordAuditCommand;
    private final StaffReadQuery staffReadQuery;

    /**
     * 录入一条轨迹节点：去重落库，再按节点码触发包裹/订单事实。重复推送与迟到节点都是幂等的无副作用返回。
     *
     * @return 是否真的落了一条新节点（false = 同一事实已记录过）。调用方用它计数/打日志——
     *     "收到 3 条、新增 1 条"比"处理了 3 条"信息量大得多，也是排查推送重复率的依据
     */
    @Transactional
    public boolean recordNode(UUID shipmentId, TrackingNodeRequest req) {
        // 1. 定位包裹：不存在给 404（越权由调用侧的权限闸门负责，这里是运营补录入口）
        Shipment shipment = Validate.notNull(shipmentMapper.selectById(shipmentId), "包裹不存在");

        // 2. 去重落库：撞唯一键 = 同一事实已记录过（重推/补录），静默返回，状态不动
        int inserted = trackingNodeMapper.insertIgnoreConflict(TrackingNode.builder()
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

        // 3. 按节点码触发事实：包裹状态是时间戳镜像，联动条件更新抢不到就是幂等
        applyFact(shipment, req.nodeCode(), req.occurredAt());

        log.info("[LOGISTICS] 轨迹节点落库, shipmentId={}, nodeCode={}", shipmentId, req.nodeCode());
        return true;
    }

    /**
     * 节点码 → 事实。签收与退回各自再补一次「已动身」：承运商可能只推终态（首条节点就是签收），
     * 这时包裹要先从待发货走到已发出，才能被签收/退回覆盖。
     */
    private void applyFact(Shipment shipment, TrackingNodeCode code, OffsetDateTime occurredAt) {
        if (code.moved()) {
            shipmentService.dispatchByCarrier(shipment, occurredAt);
        }
        if (code == TrackingNodeCode.DELIVERED) {
            shipmentService.deliver(shipment, occurredAt);
        } else if (code == TrackingNodeCode.RETURNED) {
            shipmentService.cancelByCarrier(shipment, occurredAt);
        }
        // 两个终态都该结掉未结异常单：包裹走完或退回，异常单不再需要人处理
        Shipment current = shipmentMapper.selectById(shipment.getId());
        if (current != null && current.getStatus().terminal()) {
            shipmentIssueService.resolveOnTerminal(shipment.getId(), "包裹已到终态（" + current.getStatus() + "），异常自动结单");
        }
    }

    /**
     * 平台员工补录/纠错轨迹的唯一入口：在 {@link #recordNode} 的同事务里追加一行审计账本
     * （audit :: api），「谁补的这条轨迹」要能事后反查。承运商 webhook 走的是 recordNode 那条路、
     * 没有人工操作人，因此不记审计。
     */
    @Transactional
    public boolean recordNodeByOperator(UUID shipmentId, TrackingNodeRequest req, UUID operatorId) {
        boolean inserted = recordNode(shipmentId, req);
        // 只在真的落了一行时记账：重复补录（幂等跳过）没有产生新事实，记账等于给账本灌水
        if (inserted) {
            recordAuditCommand.record(
                    AuditAction.LOGISTICS_TRACKING_WRITTEN,
                    shipmentId,
                    operatorId,
                    staffReadQuery.displayNameById(operatorId),
                    "node_code=%s, occurred_at=%s".formatted(req.nodeCode(), req.occurredAt()));
        }
        return inserted;
    }
}
