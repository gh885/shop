package com.shop.platform.admin;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.admin.mapper.ShopReview;
import com.shop.platform.common.Permissions;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 管理端判权矩阵（docs/permission-implementation.md「权限码表」）：拦截器 + StaffPermissionResolver 的
 * HTTP 契约——无权 403 PERMISSION_DENIED、有权放行、禁用员工即时失权（TIME-01）、通配放行。
 * 业务逻辑归 service 测试，这里只测判权边界。
 */
class AdminPermissionGuardTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();
    private final UUID reviewId = UUID.randomUUID();

    private ShopReview review() {
        ShopReview r = new ShopReview();
        r.setId(reviewId);
        r.setShopId(UUID.randomUUID());
        r.setStaffId(staffId);
        r.setStatus(ShopReview.STATUS_APPROVED);
        r.setDecidedAt(OffsetDateTime.now());
        r.setCreatedAt(OffsetDateTime.now());
        r.setUpdatedAt(OffsetDateTime.now());
        return r;
    }

    @Test
    void 审核接口_OPS岗位_403并带PERMISSION_DENIED() throws Exception {
        when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.CMS_MANAGE));

        mockMvc.perform(post("/admin/reviews/{id}/approve", reviewId)
                        .header("Authorization", "Bearer " + staffToken(staffId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void 审核接口_持有SHOP_REVIEW_放行() throws Exception {
        when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.SHOP_REVIEW));
        when(shopReviewService.approve(reviewId, staffId)).thenReturn(review());

        mockMvc.perform(post("/admin/reviews/{id}/approve", reviewId)
                        .header("Authorization", "Bearer " + staffToken(staffId)))
                .andExpect(status().isOk());
    }

    @Test
    void 禁用员工_合法token_下一请求即403() throws Exception {
        // token 未过期但 effectivePermissions 因 status!=ACTIVE 返回空集：收权即时生效
        when(staffService.effectivePermissions(any())).thenReturn(Set.of());

        mockMvc.perform(get("/admin/reviews")
                        .queryParam("status", "PENDING")
                        .header("Authorization", "Bearer " + staffToken(staffId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void 类目接口_OPS岗位_放行_C端令牌仍401() throws Exception {
        when(staffService.effectivePermissions(any())).thenReturn(Set.of(Permissions.CATEGORY_MANAGE));
        when(categoryService.adminTree()).thenReturn(java.util.List.of());

        mockMvc.perform(get("/admin/categories/tree").header("Authorization", "Bearer " + staffToken(staffId)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/admin/categories/tree").header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                .andExpect(status().isUnauthorized());
    }
}
