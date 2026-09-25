package com.shop.platform.account.controller;

import com.shop.platform.account.dto.LoginRequest;
import com.shop.platform.account.dto.LogoutRequest;
import com.shop.platform.account.dto.RefreshRequest;
import com.shop.platform.account.service.StaffInfo;
import com.shop.platform.account.service.StaffService;
import com.shop.platform.infra.security.TokenPair;
import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.CurrentStaff;
import com.shop.platform.infra.web.RefreshCookies;
import com.shop.platform.infra.web.RequestPaths;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
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

    /**
     * 管理端 cookie 身份：名字与买家端刻意不同（同域下两套会话不得互相覆盖），
     * 作用路径收窄到本端 refresh 端点；不设 domain —— staff 账号体系与 C 端隔离，不参与跨子域共享。
     */
    private static final RefreshCookies.Spec COOKIE =
            new RefreshCookies.Spec("staff_refresh_token", RequestPaths.ADMIN_SELF_SERVICE_PREFIX + "refresh", null);

    private final StaffService staffService;
    private final RefreshCookies refreshCookies;
    private final ClientIp clientIp;

    /** 工号 + 密码登录，返回独立于 C 端的 token（kind=staff），refresh 落 httpOnly cookie */
    @PostMapping("/login")
    public TokenPair staffLogin(
            @Valid @RequestBody LoginRequest req, HttpServletRequest servletRequest, HttpServletResponse response) {
        TokenPair result =
                staffService.login(req.employeeNo(), req.password(), req.deviceId(), clientIp.of(servletRequest));
        refreshCookies.issue(response, COOKIE, result.refreshToken());
        return result;
    }

    /** 刷新双 token（admin 纯 web：refresh 只认 httpOnly cookie，不做 body 双来源） */
    @PostMapping("/refresh")
    public TokenPair refreshStaffSession(
            HttpServletRequest request,
            HttpServletResponse response,
            @RequestBody(required = false) RefreshRequest req) {
        String refreshToken = refreshCookies.requireToken(request, COOKIE, null);
        // deviceId 可以是 null：缺省归哪个桶是会话存储的口径（ACC-21），不在入口翻译一次
        TokenPair result = staffService.refresh(refreshToken, req == null ? null : req.deviceId());
        refreshCookies.issue(response, COOKIE, result.refreshToken());
        return result;
    }

    /** 当前登录员工信息 */
    @GetMapping("/me")
    public StaffInfo getStaffMe(@CurrentStaff UUID staffId) {
        return staffService.getMe(staffId);
    }

    /** 登出：删除当前设备 refresh token + 清 cookie */
    @PostMapping("/logout")
    public void staffLogout(
            @CurrentStaff UUID staffId, @Valid @RequestBody LogoutRequest req, HttpServletResponse response) {
        staffService.logout(staffId, req.deviceId());
        refreshCookies.clear(response, COOKIE);
    }
}
