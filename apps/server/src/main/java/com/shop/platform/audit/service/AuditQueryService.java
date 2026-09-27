package com.shop.platform.audit.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.audit.api.AuditAction;
import com.shop.platform.audit.api.AuditTargetType;
import com.shop.platform.audit.dto.AdminAuditQuery;
import com.shop.platform.audit.mapper.AuditRecord;
import com.shop.platform.audit.mapper.AuditRecordMapper;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 审计查询（admin 域）：按操作人 / 对象 / 时间窗翻账本。
 *
 * <p>查询是只读的，且只读 audit 自己的 schema：审计行里的 {@code targetId} 是不带语义的主键文本
 * （跨模块对象），不为了「让表格好看」去回查各模块表 —— 那会让审计入口欠每个模块一份依赖。
 * 需要上下文时按动作去对应页面看。
 */
@Service
@RequiredArgsConstructor
public class AuditQueryService {

    private final AuditRecordMapper auditRecordMapper;

    /** 审计列表分页：筛选与排序的组成本就是查询口径，组装在 mapper，这里只解析枚举与出参形状 */
    @Transactional(readOnly = true)
    public PageResult<AdminAuditItem> pageAudits(PageParams pageParams, AdminAuditQuery query) {
        // 1. 语义筛选值自判（400）：DTO 的 @Size 只挡长度，枚举合法性收在这里，与全库其他列表同一口径
        AuditTargetType targetType = query.targetType() == null ? null : AuditTargetType.require(query.targetType());
        AuditAction action = query.action() == null ? null : AuditAction.require(query.action());

        // 2. 时间窗方向自判：from 晚于 to 是筛选条件写反，给 400 而不是返回空页让人以为「这段时间没人动过」
        if (query.from() != null && query.to() != null) {
            Validate.isTrue(!query.from().isAfter(query.to()), "开始时间不能晚于结束时间");
        }

        // 3. 取数（目标 ID 去空白：输入框里一个空格不该变成查不到任何行的筛选条件）
        String targetId = query.targetId() == null || query.targetId().isBlank() ? null : query.targetId();
        Page<AuditRecord> rows = auditRecordMapper.selectPageAdmin(
                pageParams,
                query.operatorId(),
                targetType,
                targetId,
                action == null ? null : action.code(),
                query.from(),
                query.to());

        // 4. 出参：action/targetType 原样给 code（前端按词表映射中文），detail 是掩码后的自由文本
        return new PageResult<>(
                rows.getRecords().stream()
                        .map(record -> new AdminAuditItem(
                                record.getId(),
                                record.getAction(),
                                record.getTargetType(),
                                record.getTargetId(),
                                record.getOperatorId(),
                                record.getOperatorName(),
                                record.getDetail(),
                                record.getCreatedAt()))
                        .toList(),
                rows.getTotal());
    }
}
