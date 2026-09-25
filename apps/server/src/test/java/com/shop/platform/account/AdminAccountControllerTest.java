package com.shop.platform.account;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.account.dto.AdminStaffQuery;
import com.shop.platform.account.dto.AdminUserQuery;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.account.model.UserStatus;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.StaffContext;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 管理端封号接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：守卫（401，kind=user token 进不了 /admin 链）、校验（422 缺 status / 400 非法枚举值）、
 * 路由与参数绑定（verify 透传 id + status + 当前员工）、service 错误码冒泡（404）。
 * 状态变更与会话吊销规则归 AuthServiceTest / StaffServiceTest。
 */
class AdminAccountControllerTest extends WebControllerTestSupport {

    private final UUID targetId = UUID.randomUUID();
    private final UUID staffId = UUID.randomUUID();

    /** 测试里手动 set 的操作人上下文不随请求结束，不清会漏给同一个线程后面的用例 */
    @AfterEach
    void clearStaffContext() {
        StaffContext.clear();
    }

    // GET /admin/users
    @Nested
    class 买家列表 {

        @Test
        void 匿名_401() throws Exception {
            mockMvc.perform(get("/admin/users")).andExpect(status().isUnauthorized());
        }

        @Test
        void 关键字超长_422() throws Exception {
            mockMvc.perform(get("/admin/users").with(staffAuth(staffId)).param("keyword", "a".repeat(51)))
                    .andExpect(status().is(422));
        }

        @Test
        void 筛选与分页_透传service() throws Exception {
            when(authService.pageAdminUsers(any(), any()))
                    .thenReturn(new com.shop.platform.common.PageResult<>(List.of(), 0));

            mockMvc.perform(get("/admin/users")
                            .with(staffAuth(staffId))
                            .param("status", "DISABLED")
                            .param("keyword", "138")
                            .param("page", "2")
                            .param("size", "30"))
                    .andExpect(status().isOk());

            verify(authService).pageAdminUsers(eq(new PageParams(2, 30)), eq(new AdminUserQuery("DISABLED", "138")));
        }
    }

    // GET /admin/staff
    @Nested
    class 员工列表 {

        @Test
        void 匿名_401() throws Exception {
            mockMvc.perform(get("/admin/staff")).andExpect(status().isUnauthorized());
        }

        @Test
        void 筛选与分页_透传service() throws Exception {
            when(staffService.pageAdminStaff(any(), any()))
                    .thenReturn(new com.shop.platform.common.PageResult<>(List.of(), 0));

            mockMvc.perform(get("/admin/staff")
                            .with(staffAuth(staffId))
                            .param("status", "ACTIVE")
                            .param("keyword", "E001")
                            .param("page", "3")
                            .param("size", "20"))
                    .andExpect(status().isOk());

            verify(staffService).pageAdminStaff(eq(new PageParams(3, 20)), eq(new AdminStaffQuery("ACTIVE", "E001")));
        }
    }

    // PATCH /admin/users/{id}/status
    @Nested
    class 封禁买家 {

        @Test
        void 匿名_401() throws Exception {
            mockMvc.perform(patch("/admin/users/{id}/status", targetId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DISABLED\"}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 买家令牌_401_kind隔离() throws Exception {
            mockMvc.perform(patch("/admin/users/{id}/status", targetId)
                            .header("Authorization", "Bearer " + userToken(targetId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DISABLED\"}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 禁用_透传id状态与操作人() throws Exception {
            // 操作人取当前登录员工（StaffContext），审计事件 account.status.changed 靠它落 staff_id
            StaffContext.set(staffId);
            mockMvc.perform(patch("/admin/users/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DISABLED\"}"))
                    .andExpect(status().isOk());

            verify(authService).updateUserStatus(targetId, UserStatus.DISABLED, staffId);
        }

        @Test
        void 缺status_422() throws Exception {
            mockMvc.perform(patch("/admin/users/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().is(422));
        }

        @Test
        void 非法枚举值_400() throws Exception {
            mockMvc.perform(patch("/admin/users/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"BANNED\"}"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        void 用户不存在_404冒泡() throws Exception {
            doThrow(BusinessException.notFound("用户不存在"))
                    .when(authService)
                    .updateUserStatus(eq(targetId), any(UserStatus.class), any());

            mockMvc.perform(patch("/admin/users/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DISABLED\"}"))
                    .andExpect(status().isNotFound());
        }
    }

    // PATCH /admin/staff/{id}/status
    @Nested
    class 封禁员工 {

        @Test
        void 禁用_透传id状态与操作人() throws Exception {
            StaffContext.set(staffId);
            mockMvc.perform(patch("/admin/staff/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DISABLED\"}"))
                    .andExpect(status().isOk());

            verify(staffService).updateStaffStatus(targetId, StaffStatus.DISABLED, staffId);
        }

        @Test
        void 缺status_422() throws Exception {
            mockMvc.perform(patch("/admin/staff/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().is(422));
        }

        @Test
        void 员工不存在_404冒泡() throws Exception {
            doThrow(BusinessException.notFound("员工不存在"))
                    .when(staffService)
                    .updateStaffStatus(eq(targetId), any(StaffStatus.class), any());

            mockMvc.perform(patch("/admin/staff/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DISABLED\"}"))
                    .andExpect(status().isNotFound());
        }
    }
}
