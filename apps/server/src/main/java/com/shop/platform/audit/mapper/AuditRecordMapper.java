package com.shop.platform.audit.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.audit.api.AuditTargetType;
import com.shop.platform.common.PageParams;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

/**
 * 审计账本读取。写入只有 {@link com.shop.platform.audit.api.RecordAuditCommand} 的 insert，
 * 本接口刻意不暴露任何 update/delete —— 账本不可变是这条线的全部价值，绕过它去改就等于没有审计。
 */
@Mapper
public interface AuditRecordMapper extends BaseMapper<AuditRecord> {

    /**
     * 审计查询分页：按操作人 / 目标类型 / 目标 ID / 动作 / 时间窗任意组合筛选，一律最新在前。
     *
     * <p>筛选条件的组成本就是查询口径，全部收在这里（service 只做 enum 解析与出参拼装）。
     * 时间窗取闭开区间 {@code [from, to)}：前端时间选择器给的是「到 23:59:59」，
     * 用 {@code <=} 会在毫秒精度上漏掉最后一瞬的记录。
     */
    default Page<AuditRecord> selectPageAdmin(
            PageParams pageParams,
            UUID operatorId,
            AuditTargetType targetType,
            String targetId,
            String action,
            OffsetDateTime from,
            OffsetDateTime to) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<AuditRecord>()
                        .eq(operatorId != null, AuditRecord::getOperatorId, operatorId)
                        .eq(
                                targetType != null,
                                AuditRecord::getTargetType,
                                targetType == null ? null : targetType.name())
                        .eq(targetId != null, AuditRecord::getTargetId, targetId)
                        .eq(action != null, AuditRecord::getAction, action)
                        .ge(from != null, AuditRecord::getCreatedAt, from)
                        .lt(to != null, AuditRecord::getCreatedAt, to)
                        .orderByDesc(AuditRecord::getCreatedAt));
    }
}
