package com.shop.platform.logistics;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Permissions;
import com.shop.platform.logistics.mapper.ShipmentIssue;
import com.shop.platform.logistics.model.ShipmentIssueStatus;
import com.shop.platform.logistics.model.ShipmentIssueType;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 管理端异常单接口契约。HTTP 独有：判权（LOGISTICS_MANAGE）、入参校验、404/409 透传、路径绑定。
 * 扫描判定归真库 IT（`LogisticsIT`），这里不重复。
 */
class AdminShipmentIssueControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    private final UUID issueId = UUID.randomUUID();

    private ShipmentIssue issue() {
        return ShipmentIssue.builder()
                .id(issueId)
                .shipmentId(UUID.randomUUID())
                .type(ShipmentIssueType.TRANSIT_STALLED)
                .status(ShipmentIssueStatus.OPEN)
                .detail("超过 48 小时无中转动态")
                .detectedAt(OffsetDateTime.now())
                .build();
    }

    @Nested
    class 待处理列表 { // GET /admin/logistics/issues

        @Test
        void 无LOGISTICS_MANAGE_403() throws Exception {
            when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.CATEGORY_MANAGE));

            mockMvc.perform(get("/admin/logistics/issues").with(staffAuth(staffId)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
        }

        @Test
        void 持权_200_读未结单() throws Exception {
            when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.LOGISTICS_MANAGE));
            when(shipmentIssueService.openIssues()).thenReturn(List.of(issue()));

            mockMvc.perform(get("/admin/logistics/issues").with(staffAuth(staffId)))
                    .andExpect(status().isOk());

            verify(shipmentIssueService).openIssues();
        }
    }

    @Nested
    class 手动结单 { // PUT /admin/logistics/issues/{id}/resolve

        @Test
        void 异常单不存在_透传404() throws Exception {
            when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.LOGISTICS_MANAGE));
            doThrow(BusinessException.notFound("异常单不存在"))
                    .when(shipmentIssueService)
                    .resolve(any(), any());

            mockMvc.perform(
                            put("/admin/logistics/issues/{id}/resolve", issueId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"note": "已电话催件"}
                                """))
                    .andExpect(status().isNotFound());
        }

        @Test
        void 持权_200_路径与说明透传() throws Exception {
            when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.LOGISTICS_MANAGE));

            mockMvc.perform(
                            put("/admin/logistics/issues/{id}/resolve", issueId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"note": "已电话催件"}
                                """))
                    .andExpect(status().isOk());

            verify(shipmentIssueService).resolve(eq(issueId), eq("已电话催件"));
        }
    }
}
