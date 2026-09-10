package com.shop.platform.logistics.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.logistics.dto.TrackingNodeRequest;
import com.shop.platform.logistics.service.TrackingService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端物流轨迹维护（认证由 StaffAuthFilter 统一处理，授权要求 LOGISTICS_MANAGE，岗位 OPS）。
 *
 * <p>存在的理由是<b>真实的轨迹也会缺</b>：承运商漏扫、推送丢失、人工纠错都要有补录通道。
 * 三期接承运商后 webhook 落的是同一个 service 落点，本接口不是临时脚手架。
 */
@Tag(name = "admin-logistics", description = "管理端物流轨迹维护")
@RestController
@RequestMapping("/admin/logistics")
@RequiredArgsConstructor
@RequirePermission(Permissions.LOGISTICS_MANAGE)
public class AdminLogisticsController {

    private final TrackingService trackingService;

    /** 补录轨迹节点：重复节点（同包裹/节点码/时刻/地点）幂等跳过，不报错 */
    @PostMapping("/shipments/{id}/tracking-nodes")
    @ResponseStatus(HttpStatus.CREATED)
    public void recordTrackingNode(@PathVariable UUID id, @Valid @RequestBody TrackingNodeRequest req) {
        trackingService.recordNode(id, req);
    }
}
