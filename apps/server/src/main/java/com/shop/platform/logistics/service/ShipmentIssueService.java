package com.shop.platform.logistics.service;

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
 * <p>两条闭环，缺一不可：
 * <ul>
 *   <li><b>建单</b>（{@link #scan}）：按期扫停滞包裹。同一包裹同类异常只留一张未结单——
 *       每轮都建一张会把列表变成噪音，客服会立刻学会忽略它。</li>
 *   <li><b>自动结单</b>（{@link #resolveOnTerminal}）：包裹签收/退回后未结单自动结掉。
 *       异常不再需要人处理时留着它就是假待办，而"假待办"是异常列表失去信任的开始。</li>
 * </ul>
 * 客服手动结单（{@link #resolve}）用于"联系承运商催过、包裹继续走"这类人工判断。
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
            List<Shipment> stalled =
                    shipmentMapper.selectStalled(type.fromStatuses(), now.minus(type.threshold()), BATCH_LIMIT);
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

    /** 包裹到终态时自动结单：由轨迹落库路径调用（同事务），返回结单数 */
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
     */
    @Transactional
    public void resolve(UUID issueId, String note) {
        Validate.notNull(issueMapper.selectById(issueId), "异常单不存在");
        String detail = Text.trimToNull(note);
        Validate.isTrue(issueMapper.resolve(issueId, detail, OffsetDateTime.now()) == 1, 409, "异常单已处理，无需重复操作");
    }
}
