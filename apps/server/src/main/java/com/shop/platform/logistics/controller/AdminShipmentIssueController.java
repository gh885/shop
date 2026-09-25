package com.shop.platform.logistics.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.logistics.dto.ResolveIssueRequest;
import com.shop.platform.logistics.service.ShipmentIssueService;
import com.shop.platform.logistics.service.ShipmentIssueView;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端物流异常治理（授权要求 LOGISTICS_MANAGE，与轨迹维护同权：都是同一件事的入口）。
 *
 * <p>只开两个动作：看未结单、结单。扫描是任务自己跑的，不给人手动触发的入口——
 * "手动重扫"通常意味着阈值不对，该改的是阈值而不是加个按钮。
 */
@Tag(name = "admin-logistics", description = "管理端物流轨迹维护")
@RestController
@RequestMapping("/admin/logistics/issues")
@RequiredArgsConstructor
@RequirePermission(Permissions.LOGISTICS_MANAGE)
public class AdminShipmentIssueController {

    private final ShipmentIssueService issueService;

    /**
     * 待处理异常单（客服待办）：按发现时间倒序，<b>最多 {@code PageParams.SIZE_MAX} 条</b>（口径见 LOG-33）。
     *
     * <p>这一格不做分页：待办的用法是「把最卡人的那批处理掉」，不是翻历史；做成 PageResult 只会多出一个
     * 没人查的第二页。封顶的意义在于它不是导出接口——扫描每类异常单轮可开 200 张，不封顶时一次阈值调错
     * 就能把整表灌进一个响应里。被截掉的是最老的未结单，行还在库里，等前面的被处理完自然浮上来。
     */
    @GetMapping
    public List<ShipmentIssueView> listOpenIssues() {
        return issueService.openIssues().stream().map(ShipmentIssueView::from).toList();
    }

    /** 手动结单：不存在 404、已结 409——不静默成功 */
    @PutMapping("/{id}/resolve")
    public void resolveIssue(@PathVariable UUID id, @Valid @RequestBody ResolveIssueRequest req) {
        issueService.resolve(id, req.note());
    }
}
