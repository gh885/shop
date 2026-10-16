package com.shop.platform.rum;

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
 * 遥测排查接口（HTTP 契约）：RUM_VIEW 判权矩阵 + 未登录守卫 + 参数口径。
 *
 * <p>只测 HTTP 边界独有的失败面。取数与聚合归 {@link RumQueryIT}，这里不重复——service 未被基类 mock，
 * 有权那几条走真实只读查询打真库（读操作、不依赖种子数据），所以顺带验到接线是通的。
 *
 * <p>这条线比审计更需要判权：它出参里有 {@code userId} / {@code sessionId}，是全库唯一能把
 * 「一个错误」追到「哪些人」的地方。所以「持别的权不放行」这一格在这里不是形式主义。
 */
class AdminRumControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    @Test
    void 无RUM_VIEW_403带PERMISSION_DENIED() throws Exception {
        // 能看审计账本 ≠ 能看遥测明细：判权按码精确，不给「差不多就行」
        when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.AUDIT_VIEW));

        mockMvc.perform(get("/admin/rum/issues").with(staffAuth(staffId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void C端令牌打管理端_401() throws Exception {
        mockMvc.perform(get("/admin/rum/issues").with(userAuth(UUID.randomUUID())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 三个端点都吃同一个权限码() throws Exception {
        when(staffService.effectivePermissions(any())).thenReturn(Set.of());

        mockMvc.perform(get("/admin/rum/events").with(staffAuth(staffId))).andExpect(status().isForbidden());
        mockMvc.perform(get("/admin/rum/events/" + UUID.randomUUID()).with(staffAuth(staffId)))
                .andExpect(status().isForbidden());
    }

    @Test
    void 持有RUM_VIEW_放行_200() throws Exception {
        when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.RUM_VIEW));

        mockMvc.perform(get("/admin/rum/issues").with(staffAuth(staffId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.records").isArray())
                .andExpect(jsonPath("$.total").exists());
        mockMvc.perform(get("/admin/rum/events").with(staffAuth(staffId))).andExpect(status().isOk());
    }

    /**
     * 筛选值写错给 400，不静默返回空页。
     *
     * <p>空页会把「筛错了」伪装成「最近没问题」——手册里写着 web、手打成 wev，看到空列表就下班了。
     */
    @Test
    void 名单外的app或kind_400() throws Exception {
        mockMvc.perform(get("/admin/rum/issues").param("app", "wev").with(staffAuth(staffId)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/admin/rum/events").param("kind", "js").with(staffAuth(staffId)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 时间窗写反_400() throws Exception {
        mockMvc.perform(get("/admin/rum/issues")
                        .param("from", "2026-10-17T12:00:00Z")
                        .param("to", "2026-10-17T00:00:00Z")
                        .with(staffAuth(staffId)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 详情不存在_404() throws Exception {
        mockMvc.perform(get("/admin/rum/events/" + UUID.randomUUID()).with(staffAuth(staffId)))
                .andExpect(status().isNotFound());
    }
}
