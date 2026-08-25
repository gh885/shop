package com.shop.platform.admin;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.admin.service.StaffInfo;
import com.shop.platform.infra.security.TokenPair;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 员工认证接口契约：工号登录下发 httpOnly refresh cookie、admin 端刷新只认 Cookie 不认 Body、
 * me/logout 上下文透传。与 C 端 /auth/** 完全独立（kind=staff）。
 */
class StaffAuthControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    @Test
    void 工号登录_成功_下发刷新Cookie() throws Exception {
        when(staffService.login("E001", "password123", "dev1")).thenReturn(new TokenPair("staff-at", "staff-rt"));

        mockMvc.perform(
                        post("/admin/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                            {"employeeNo": "E001", "password": "password123", "deviceId": "dev1"}
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("staff-at"))
                // admin 端 cookie 与 C 端路径隔离
                .andExpect(cookie().exists("staff_refresh_token"))
                .andExpect(cookie().httpOnly("staff_refresh_token", true))
                .andExpect(cookie().path("staff_refresh_token", "/admin/auth/refresh"));

        verify(staffService).login("E001", "password123", "dev1");
    }

    @Test
    void 登录_缺设备号_422() throws Exception {
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

    @Test
    void 刷新_只认Cookie不认Body() throws Exception {
        when(staffService.refresh("rt:cookie", "default")).thenReturn(new TokenPair("new-at", "new-rt"));

        mockMvc.perform(post("/admin/auth/refresh")
                        .cookie(new jakarta.servlet.http.Cookie("staff_refresh_token", "rt:cookie")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("new-at"));
    }

    @Test
    void 刷新_无Cookie_401() throws Exception {
        mockMvc.perform(post("/admin/auth/refresh"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
    }

    @Test
    void 当前员工信息_员工令牌守卫() throws Exception {
        when(staffService.getMe(staffId)).thenReturn(new StaffInfo(staffId, "E001", "运营小王"));

        mockMvc.perform(get("/admin/auth/me").header("Authorization", "Bearer " + staffToken(staffId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeNo").value("E001"));

        // C 端用户令牌进不了管理端链路
        mockMvc.perform(get("/admin/auth/me").header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 登出_清设备令牌与Cookie() throws Exception {
        mockMvc.perform(post("/admin/auth/logout")
                        .header("Authorization", "Bearer " + staffToken(staffId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"deviceId": "dev1"}
                            """))
                .andExpect(status().isOk())
                .andExpect(cookie().maxAge("staff_refresh_token", 0));

        verify(staffService).logout(staffId, "dev1");
    }
}
