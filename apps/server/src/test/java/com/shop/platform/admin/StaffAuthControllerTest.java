package com.shop.platform.admin;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.infra.security.TokenPair;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 员工认证接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：status、守卫（401）、校验（422）、错误码，以及 cookie 的 httpOnly/路径/maxAge 清空。
 * 令牌签发细节归 infra.security 单测；响应体字段形状由 OpenAPI→SDK 钉死。
 */
class StaffAuthControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    @Nested
    class 登录 { // POST /admin/auth/login

        @Test
        void 成功_下发HttpOnly刷新Cookie() throws Exception {
            when(staffService.login("E001", "password123", "dev1")).thenReturn(new TokenPair("staff-at", "staff-rt"));

            mockMvc.perform(
                            post("/admin/auth/login")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"employeeNo": "E001", "password": "password123", "deviceId": "dev1"}
                                """))
                    .andExpect(status().isOk())
                    // admin 端 cookie 与 C 端路径隔离
                    .andExpect(cookie().exists("staff_refresh_token"))
                    .andExpect(cookie().httpOnly("staff_refresh_token", true))
                    .andExpect(cookie().path("staff_refresh_token", "/admin/auth/refresh"));

            verify(staffService).login("E001", "password123", "dev1");
        }

        @Test
        void 缺deviceId_422() throws Exception {
            mockMvc.perform(
                            post("/admin/auth/login")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"employeeNo": "E001", "password": "password123"}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("deviceId"));
        }
    }

    @Nested
    class 刷新 { // POST /admin/auth/refresh

        @Test
        void 只认Cookie_解码续签() throws Exception {
            when(staffService.refresh("rt:cookie", "default")).thenReturn(new TokenPair("new-at", "new-rt"));

            mockMvc.perform(post("/admin/auth/refresh")
                            .cookie(new jakarta.servlet.http.Cookie("staff_refresh_token", "rt:cookie")))
                    .andExpect(status().isOk());

            verify(staffService).refresh("rt:cookie", "default");
        }

        @Test
        void 无Cookie_401() throws Exception {
            mockMvc.perform(post("/admin/auth/refresh"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        }
    }

    @Nested
    class 当前员工 { // GET /admin/auth/me

        @Test
        void 用户令牌_401() throws Exception {
            mockMvc.perform(get("/admin/auth/me").header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 登出 { // POST /admin/auth/logout

        @Test
        void 清Cookies() throws Exception {
            mockMvc.perform(
                            post("/admin/auth/logout")
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"deviceId": "dev1"}
                                """))
                    .andExpect(status().isOk())
                    .andExpect(cookie().maxAge("staff_refresh_token", 0));

            verify(staffService).logout(staffId, "dev1");
        }
    }
}
