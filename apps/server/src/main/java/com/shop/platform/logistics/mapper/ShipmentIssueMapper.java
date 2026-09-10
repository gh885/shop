package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.logistics.model.ShipmentIssueStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

/** 异常单读写。扫描候选（哪些包裹卡住了）在 {@link ShipmentMapper}——那是包裹的查询。 */
@Mapper
public interface ShipmentIssueMapper extends BaseMapper<ShipmentIssue> {

    /** 未结单列表（客服待办）：按发现时间倒序，最新卡住的排前面 */
    default List<ShipmentIssue> selectOpen() {
        return selectList(new LambdaQueryWrapper<ShipmentIssue>()
                .eq(ShipmentIssue::getStatus, ShipmentIssueStatus.OPEN)
                .orderByDesc(ShipmentIssue::getDetectedAt));
    }

    /**
     * 结单：OPEN → RESOLVED。抢不到（已结/不存在）返回 0。
     * 影响行数即闸门，客服重复点"已处理"是幂等的无副作用返回（与订单状态机同一套路）。
     */
    default int resolve(UUID issueId, String detail, OffsetDateTime resolvedAt) {
        LambdaUpdateWrapper<ShipmentIssue> update = new LambdaUpdateWrapper<ShipmentIssue>()
                .eq(ShipmentIssue::getId, issueId)
                .eq(ShipmentIssue::getStatus, ShipmentIssueStatus.OPEN)
                .set(ShipmentIssue::getStatus, ShipmentIssueStatus.RESOLVED)
                .set(ShipmentIssue::getResolvedAt, resolvedAt);
        if (detail != null) {
            update.set(ShipmentIssue::getDetail, detail);
        }
        return update(null, update);
    }

    /** 包裹到终态后自动结掉它所有未结单（异常不再需要人处理，留着就是假待办），返回结单数 */
    default int resolveAllOpenOf(UUID shipmentId, String detail, OffsetDateTime resolvedAt) {
        return update(
                null,
                new LambdaUpdateWrapper<ShipmentIssue>()
                        .eq(ShipmentIssue::getShipmentId, shipmentId)
                        .eq(ShipmentIssue::getStatus, ShipmentIssueStatus.OPEN)
                        .set(ShipmentIssue::getStatus, ShipmentIssueStatus.RESOLVED)
                        .set(ShipmentIssue::getDetail, detail)
                        .set(ShipmentIssue::getResolvedAt, resolvedAt));
    }
}
