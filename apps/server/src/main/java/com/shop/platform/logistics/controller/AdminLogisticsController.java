package com.shop.platform.logistics.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentStaff;
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

    /**
     * 补录轨迹节点：重复节点（同包裹/节点码/时刻/地点）幂等跳过，不报错。
     *
     * <p><b>状态码恒 201，含被幂等跳过的那一次</b>——刻意不按「这次真的插了一行」分 200/201。分岔要成立，
     * 得让调用方拿这个差别做点什么，而这里没人拿：service 那个 boolean 是「是否推进了状态」的中间量，管理端
     * 唯一的消费者（apps/admin）连这个入口都还没接（只有生成的 SDK 占位），SDK 的类型也写着 201 无返回体。
     * 更实在的理由是幂等那条路的语义：<b>请求要造成的世界状态已经在了</b>，201 报的是「你要的那条事实现在在轨迹里」，
     * 不是「我刚替你插了一行」——重复推送与补录撞车时，重推方（承运商 webhook 与这里是同一个落点）本来就不该
     * 因为「早就有了」收到一个不同的码，否则每个接入方都得处理两种成功。
     */
    @PostMapping("/shipments/{id}/tracking-nodes")
    @ResponseStatus(HttpStatus.CREATED)
    public void recordTrackingNode(
            @CurrentStaff UUID staffId, @PathVariable UUID id, @Valid @RequestBody TrackingNodeRequest req) {
        trackingService.recordNodeByOperator(id, req, staffId);
    }
}
