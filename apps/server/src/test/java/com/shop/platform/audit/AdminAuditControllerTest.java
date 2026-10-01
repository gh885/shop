package com.shop.platform.audit;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.Permissions;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 审计查询接口（HTTP 契约）：AUDIT_VIEW 判权矩阵 + 未登录守卫。
 *
 * <p>只测 HTTP 边界独有的失败面（守卫 401、无权 403、有权放行）。筛选解析与出参映射是 service
 * 的事，归 {@link AuditQueryServiceTest}，这里不重复。service 未被基类 mock，有权那条走真实只读查询
 * 打空账本（读操作、不依赖种子数据）。
 */
class AdminAuditControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    @Test
    void 无AUDIT_VIEW_403带PERMISSION_DENIED() throws Exception {
        // 持别的权不等于持审计权：判权按码精确，不给「差不多就行」
        when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.CMS_MANAGE));

        mockMvc.perform(get("/admin/audits").with(staffAuth(staffId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void 空权限_禁用员工即时失权_403() throws Exception {
        when(staffService.effectivePermissions(any())).thenReturn(Set.of());

        mockMvc.perform(get("/admin/audits").with(staffAuth(staffId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void C端令牌打管理端_401() throws Exception {
        // /admin 命名空间只认 staff 令牌：拿买家令牌进门直接被守卫挡在判权之前
        mockMvc.perform(get("/admin/audits").with(userAuth(UUID.randomUUID()))).andExpect(status().isUnauthorized());
    }

    @Test
    void 持有AUDIT_VIEW_放行_200空账本() throws Exception {
        when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.AUDIT_VIEW));

        mockMvc.perform(get("/admin/audits").with(staffAuth(staffId))).andExpect(status().isOk());
    }
}
