package com.shop.platform.account;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.account.model.UserStatus;
import com.shop.platform.common.BusinessException;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 管理端封号接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：守卫（401，kind=user token 进不了 /admin 链）、校验（422 缺 status / 400 非法枚举值）、
 * 路由与参数绑定（verify 透传 id + status）、service 错误码冒泡（404）。
 * 状态变更与会话吊销规则归 AuthServiceTest / StaffServiceTest。
 */
class AdminAccountControllerTest extends WebControllerTestSupport {

    private final UUID targetId = UUID.randomUUID();
    private final UUID staffId = UUID.randomUUID();

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
        void 禁用_透传id与状态() throws Exception {
            mockMvc.perform(patch("/admin/users/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DISABLED\"}"))
                    .andExpect(status().isOk());

            verify(authService).updateUserStatus(targetId, UserStatus.DISABLED);
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
                    .updateUserStatus(eq(targetId), any(UserStatus.class));

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
        void 禁用_透传id与状态() throws Exception {
            mockMvc.perform(patch("/admin/staff/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DISABLED\"}"))
                    .andExpect(status().isOk());

            verify(staffService).updateStaffStatus(targetId, StaffStatus.DISABLED);
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
                    .updateStaffStatus(eq(targetId), any(StaffStatus.class));

            mockMvc.perform(patch("/admin/staff/{id}/status", targetId)
                            .with(staffAuth(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DISABLED\"}"))
                    .andExpect(status().isNotFound());
        }
    }
}
