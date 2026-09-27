package com.shop.platform.audit.controller;

import com.shop.platform.audit.dto.AdminAuditQuery;
import com.shop.platform.audit.service.AdminAuditItem;
import com.shop.platform.audit.service.AuditQueryService;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端操作审计查询（admin 域）。统一审计入口：治理动作的账本按操作人 / 对象 / 时间窗检索。
 *
 * <p>只读。账本的写入在各业务模块经 audit :: api 的 RecordAuditCommand 完成，与动作同事务。
 */
@Tag(name = "admin-audits", description = "管理端操作审计查询")
@RestController
@RequestMapping("/admin/audits")
@RequiredArgsConstructor
@Validated
@RequirePermission(Permissions.AUDIT_VIEW)
public class AdminAuditController {

    private final AuditQueryService auditQueryService;

    /** GET /admin/audits —— 审计账本分页；条件全空即「最近发生了什么」 */
    @GetMapping
    public PageResult<AdminAuditItem> listAuditRecords(@Valid PageParams pageParams, @Valid AdminAuditQuery query) {
        return auditQueryService.pageAudits(pageParams, query);
    }
}
