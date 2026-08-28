package com.shop.platform.admin.controller;

import com.shop.platform.admin.dto.LoginRequest;
import com.shop.platform.admin.dto.LogoutRequest;
import com.shop.platform.admin.dto.RefreshRequest;
import com.shop.platform.admin.infra.StaffContext;
import com.shop.platform.admin.service.StaffInfo;
import com.shop.platform.admin.service.StaffService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.TokenPair;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.Arrays;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "admin-auth", description = "平台员工认证")
@RestController
@RequestMapping("/admin/auth")
@RequiredArgsConstructor
public class StaffAuthController {

    private static final String REFRESH_COOKIE = "staff_refresh_token";
    private static final long REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 天秒数

    private final StaffService staffService;

    /** 工号 + 密码登录，返回独立于 C 端的 token（kind=staff），refresh 落 httpOnly cookie */
    @PostMapping("/login")
    public TokenPair staffLogin(@Valid @RequestBody LoginRequest req, HttpServletResponse response) {
        TokenPair result = staffService.login(req.employeeNo(), req.password(), req.deviceId());
        setRefreshCookie(response, result.refreshToken());
        return result;
    }

    /** 刷新双 token（admin 纯 web：refresh 只认 httpOnly cookie，不做 body 双来源） */
    @PostMapping("/refresh")
    public TokenPair refreshStaffSession(
            HttpServletRequest request,
            HttpServletResponse response,
            @RequestBody(required = false) RefreshRequest req) {
        String refreshToken = readRefreshCookie(request);
        if (refreshToken == null) {
            throw new BusinessException(401, "INVALID_TOKEN", "Refresh Token 未提供");
        }
        String deviceId = req != null && req.deviceId() != null ? req.deviceId() : "default";
        TokenPair result = staffService.refresh(refreshToken, deviceId);
        setRefreshCookie(response, result.refreshToken());
        return result;
    }

    /** 当前登录员工信息 */
    @GetMapping("/me")
    public StaffInfoResponse getStaffMe() {
        return StaffInfoResponse.from(staffService.getMe(StaffContext.get()));
    }

    /** 登出：删除当前设备 refresh token + 清 cookie */
    @PostMapping("/logout")
    public void staffLogout(@Valid @RequestBody LogoutRequest req, HttpServletResponse response) {
        staffService.logout(StaffContext.get(), req.deviceId());
        clearRefreshCookie(response);
    }

    // ---- Cookie 处理 ----

    private void setRefreshCookie(HttpServletResponse response, String refreshToken) {
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                buildRefreshCookie(refreshToken, REFRESH_COOKIE_MAX_AGE).toString());
    }

    private void clearRefreshCookie(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildRefreshCookie("", 0).toString());
    }

    private ResponseCookie buildRefreshCookie(String value, long maxAgeSec) {
        return ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path("/admin/auth/refresh")
                .maxAge(Duration.ofSeconds(maxAgeSec))
                .build();
    }

    /** 只从 cookie 取 refresh token（admin 无 native 端，无需 body 来源） */
    private String readRefreshCookie(HttpServletRequest request) {
        if (request.getCookies() != null) {
            return Arrays.stream(request.getCookies())
                    .filter(c -> REFRESH_COOKIE.equals(c.getName()))
                    .map(Cookie::getValue)
                    .findFirst()
                    .orElse(null);
        }
        return null;
    }

    /** 员工信息出参：镜像 service 的 StaffInfo，字段只减不增 */
    public record StaffInfoResponse(
            UUID id, String employeeNo, String displayName, String role, java.util.List<String> permissions) {

        static StaffInfoResponse from(StaffInfo info) {
            return new StaffInfoResponse(
                    info.id(), info.employeeNo(), info.displayName(), info.role(), info.permissions());
        }
    }
}
