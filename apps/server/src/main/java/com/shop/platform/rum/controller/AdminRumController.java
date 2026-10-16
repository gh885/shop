package com.shop.platform.rum.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.rum.dto.AdminRumEventQuery;
import com.shop.platform.rum.dto.AdminRumIssueQuery;
import com.shop.platform.rum.service.AdminRumEventDetail;
import com.shop.platform.rum.service.AdminRumEventItem;
import com.shop.platform.rum.service.AdminRumIssueItem;
import com.shop.platform.rum.service.RumQueryService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端前端遥测排查（admin 域）：`/admin/rum/*` 三级只读——问题列表 → 明细列表 → 单条原件。
 *
 * <p>入口住在 rum 模块而不是别处，因为它读的是 rum 自己的 schema：`packages` 那句「不对外提供任何 API」
 * 约束的是**别的 Java 模块**不许 import 这里的 service/mapper，不阻止本模块自建管理端入口
 * （审计同理：{@code AdminAuditController} 在 audit 模块里读 audit 的表）。
 *
 * <p>整类挂 {@link Permissions#RUM_VIEW}：这条线上有 {@code userId} / {@code sessionId}，
 * 是全库唯一能把「一个错误」追到「哪些人」的地方，所以它不是公开的看板，是需要权限码的内网工具。
 *
 * <p>只读，没有第二个写入口——明细行一旦落库就不变（见 {@code RumEventMapper}）。
 */
@Tag(name = "admin-rum", description = "管理端前端遥测排查")
@RestController
@RequestMapping("/admin/rum")
@RequiredArgsConstructor
@Validated
@RequirePermission(Permissions.RUM_VIEW)
public class AdminRumController {

    private final RumQueryService rumQueryService;

    /** GET /admin/rum/issues —— 有哪些问题：按指纹聚合、按影响会话数降序；默认最近 24 小时 */
    @GetMapping("/issues")
    public PageResult<AdminRumIssueItem> listRumIssues(@Valid PageParams pageParams, @Valid AdminRumIssueQuery query) {
        return rumQueryService.pageIssues(pageParams, query);
    }

    /** GET /admin/rum/events —— 明细列表；带 fingerprint 就是「点进某一个问题的第 2 层」 */
    @GetMapping("/events")
    public PageResult<AdminRumEventItem> listRumEvents(@Valid PageParams pageParams, @Valid AdminRumEventQuery query) {
        return rumQueryService.pageEvents(pageParams, query);
    }

    /** GET /admin/rum/events/{id} —— 具体那一次：拿整条原件（堆栈、面包屑、设备） */
    @GetMapping("/events/{id}")
    public AdminRumEventDetail getRumEventDetail(@PathVariable UUID id) {
        return rumQueryService.eventDetail(id);
    }
}
