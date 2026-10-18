package com.shop.platform.logistics.service;

import com.shop.platform.account.api.StaffReadQuery;
import com.shop.platform.audit.api.AuditAction;
import com.shop.platform.audit.api.RecordAuditCommand;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentIssue;
import com.shop.platform.logistics.mapper.ShipmentIssueMapper;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.mapper.TrackingNodeMapper;
import com.shop.platform.logistics.model.ShipmentIssueStatus;
import com.shop.platform.logistics.model.ShipmentIssueType;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 物流异常治理 —— 把"该有动静却没有"变成客服的待办。
 *
 * <p>三条口径，缺一不可：
 * <ul>
 *   <li><b>建单</b>（{@link #scan}）：按期扫停滞包裹。候选查询排除已有同类未结单的包裹，
 *       也排除「已就当前这段停滞结过案」的包裹——每轮重建一张会把列表变成噪音，客服会立刻学会忽略它。</li>
 *   <li><b>自动结单</b>（{@link #resolveOnTerminal}）：包裹签收/退回/取消后未结单自动结掉。
 *       异常不再需要人处理时留着它就是假待办，而"假待办"是异常列表失去信任的开始。</li>
 *   <li><b>手动结单</b>（{@link #resolve}）结的是"当前这一段停滞"：包裹有了新轨迹之后再次停滞，才会重开新单。</li>
 * </ul>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ShipmentIssueService {

    /** 单类异常单轮上限：不设限的话一次阈值调整可能瞬间灌满列表 */
    private static final int BATCH_LIMIT = 200;

    private final ShipmentIssueMapper issueMapper;

    private final ShipmentMapper shipmentMapper;

    private final TrackingNodeMapper trackingNodeMapper;
    private final RecordAuditCommand recordAuditCommand;
    private final StaffReadQuery staffReadQuery;

    /**
     * 扫一轮异常（非事务，逐单独立提交）——与超时扫描同一条哲学：
     * 单笔失败不影响其余，正确性由下一轮重试保证，不靠任务"一次成功"。
     *
     * @return 本轮新开的异常单数
     */
    public int scan() {
        OffsetDateTime now = OffsetDateTime.now();
        int opened = 0;
        for (ShipmentIssueType type : ShipmentIssueType.values()) {
            OffsetDateTime stalledBefore = now.minus(type.threshold());
            List<Shipment> stalled = type.fromNodes().isEmpty()
                    ? shipmentMapper.selectStalledWithoutTracking(stalledBefore, BATCH_LIMIT)
                    : shipmentMapper.selectStalledAtNodes(type.name(), type.fromNodes(), stalledBefore, BATCH_LIMIT);
            for (Shipment shipment : stalled) {
                if (openIssue(type, shipment, now)) {
                    opened++;
                }
            }
        }
        return opened;
    }

    /** 待处理异常单（客服列表） */
    public List<ShipmentIssue> openIssues() {
        return issueMapper.selectOpen();
    }

    /** 包裹到终态时自动结单：由各终态转移路径调用（签收/退回的轨迹落库、卖家取消，同事务），返回结单数 */
    @Transactional
    public int resolveOnTerminal(UUID shipmentId, String reason) {
        return issueMapper.resolveAllOpenOf(shipmentId, reason, OffsetDateTime.now());
    }

    /**
     * 开一张异常单：撞"同一包裹同类至多一张未结单"的唯一索引即视为已存在，静默跳过。
     *
     * <p>这里可以抓 DuplicateKeyException 而不必用 ON CONFLICT：不需要在冲突后继续用同一事务，
     * 异常逃出方法即整体回滚，下一单不受影响。用不了 ON CONFLICT 的原因是实体插入要 id 自动填充，
     * 自定义 @Insert 拿不到 MetaObjectHandler。
     */
    private boolean openIssue(ShipmentIssueType type, Shipment shipment, OffsetDateTime now) {
        OffsetDateTime lastActivity =
                trackingNodeMapper.selectLastOccurredAt(shipment.getId()).orElse(shipment.getShippedAt());
        try {
            issueMapper.insert(ShipmentIssue.builder()
                    .shipmentId(shipment.getId())
                    .type(type)
                    .status(ShipmentIssueStatus.OPEN)
                    .detail("%s；最后动态 %s（已停滞约 %d 小时）"
                            .formatted(
                                    type.description(),
                                    lastActivity,
                                    Duration.between(lastActivity, now).toHours()))
                    .detectedAt(now)
                    .build());
            log.info("[LOGISTICS] 物流异常, 类型={}, 运单号={}", type, shipment.getTrackingNo());
            return true;
        } catch (DuplicateKeyException e) {
            return false;
        }
    }

    /**
     * 客服手动结单。不存在给 404、已结给 409——不静默成功：
     * "我以为我处理了但其实没处理"是运营事故的常见起点。
     *
     * <p>结的是"当前这一段停滞"：同一段停滞不会被重开；包裹有新轨迹之后再次停滞超阈，扫描才开新单
     * （候选查询的判据：结案时刻晚于最后动态时刻即视为已结案）。
     *
     * <p>审计账本（audit :: api）同事务写入：结单是平台处置动作，「谁结的单」要能反查。
     */
    @Transactional
    public void resolve(UUID issueId, UUID operatorId, String note) {
        Validate.notNull(issueMapper.selectById(issueId), "异常单不存在");
        String detail = Text.trimToNull(note);
        Validate.conflict(issueMapper.resolve(issueId, detail, OffsetDateTime.now()) == 1, "异常单已处理，无需重复操作");
        recordAuditCommand.record(
                AuditAction.LOGISTICS_SHIPMENT_ISSUE_RESOLVED,
                issueId,
                operatorId,
                staffReadQuery.displayNameById(operatorId),
                "note=%s".formatted(detail == null ? "-" : detail));
    }
}
