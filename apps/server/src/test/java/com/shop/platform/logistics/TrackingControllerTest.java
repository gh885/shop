package com.shop.platform.logistics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Permissions;
import com.shop.platform.logistics.dto.TrackingNodeRequest;
import com.shop.platform.logistics.model.TrackingNodeCode;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 物流轨迹接口契约。分组 = 接口路径（一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>只断言 HTTP 边界独有的失败面：鉴权守卫（401/403）、错误码透传（404）、方法路由与参数绑定（verify）。
 * 轨迹推进与归属判定归真库 IT；响应字段形状由 OpenAPI→SDK 钉死。
 */
class TrackingControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    private final UUID shipmentId = UUID.randomUUID();

    private final UUID staffId = UUID.randomUUID();

    @Nested
    class 查询订单轨迹 { // GET /orders/{id}/tracking

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/orders/{id}/tracking", orderId)).andExpect(status().isUnauthorized());
        }

        @Test
        void 登录_绑定当前用户与订单ID且404透传() throws Exception {
            // 归属判定在 service：controller 只负责把路径变量与登录态一起递下去
            when(shipmentService.trackingOfOrder(any(), any())).thenThrow(BusinessException.notFound("暂无物流信息"));

            mockMvc.perform(get("/orders/{id}/tracking", orderId).with(userAuth(userId)))
                    .andExpect(status().isNotFound());

            verify(shipmentService).trackingOfOrder(userId, orderId);
        }
    }

    @Nested
    class 补录轨迹节点 { // POST /admin/logistics/shipments/{id}/tracking-nodes

        @Test
        void 无LOGISTICS_MANAGE_403并带PERMISSION_DENIED() throws Exception {
            when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.CATEGORY_MANAGE));

            mockMvc.perform(
                            post("/admin/logistics/shipments/{id}/tracking-nodes", shipmentId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"nodeCode": "PICKED_UP", "occurredAt": "2026-01-01T10:00:00+08:00"}
                                """))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
        }

        @Test
        void 非法节点码_400() throws Exception {
            when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.LOGISTICS_MANAGE));

            mockMvc.perform(
                            post("/admin/logistics/shipments/{id}/tracking-nodes", shipmentId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"nodeCode": "TELEPORTED", "occurredAt": "2026-01-01T10:00:00+08:00"}
                                """))
                    .andExpect(status().isBadRequest());
        }

        @Test
        void 缺occurredAt_422() throws Exception {
            when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.LOGISTICS_MANAGE));

            mockMvc.perform(
                            post("/admin/logistics/shipments/{id}/tracking-nodes", shipmentId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"nodeCode": "PICKED_UP"}
                                """))
                    .andExpect(status().isUnprocessableEntity());
        }

        @Test
        void 持有LOGISTICS_MANAGE_201_路径与入参透传() throws Exception {
            when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.LOGISTICS_MANAGE));

            mockMvc.perform(
                            post("/admin/logistics/shipments/{id}/tracking-nodes", shipmentId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"nodeCode": "ARRIVED_HUB", "occurredAt": "2026-01-01T10:00:00+08:00",
                                 "description": "到达杭州转运中心", "location": "杭州"}
                                """))
                    .andExpect(status().isCreated());

            ArgumentCaptor<TrackingNodeRequest> captured = ArgumentCaptor.forClass(TrackingNodeRequest.class);
            verify(trackingService).recordNode(eq(shipmentId), captured.capture());
            TrackingNodeRequest recorded = captured.getValue();
            assertEquals(TrackingNodeCode.ARRIVED_HUB, recorded.nodeCode());
            assertEquals("到达杭州转运中心", recorded.description());
            assertEquals("杭州", recorded.location());
            // 时刻按瞬时点比对：带偏移的 wire 值落到哪个时区段不影响契约
            assertEquals(
                    OffsetDateTime.parse("2026-01-01T10:00:00+08:00").toInstant(),
                    recorded.occurredAt().toInstant());
        }
    }
}
