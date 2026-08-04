package com.shop.platform.admin.controller;

import com.shop.platform.admin.infra.StaffContext;
import com.shop.platform.admin.service.StaffService;
import com.shop.platform.admin.service.StaffService.StaffInfo;
import com.shop.platform.admin.service.StaffService.TokenResult;
import com.shop.platform.common.BusinessException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/auth")
@RequiredArgsConstructor
public class StaffAuthController {

    private final StaffService staffService;

    /** 工号 + 密码登录，返回独立于 C 端的 token（kind=staff） */
    @PostMapping("/login")
    public TokenResult login(@Valid @RequestBody LoginRequest req) {
        return staffService.login(req.employeeNo(), req.password(), req.deviceId());
    }

    /** 刷新双 token（后台工作台不落 Cookie，refresh token 走请求体） */
    @PostMapping("/refresh")
    public TokenResult refresh(@RequestBody(required = false) RefreshRequest req) {
        String refreshToken = req != null ? req.refreshToken() : null;
        if (refreshToken == null) {
            throw new BusinessException(401, "INVALID_TOKEN", "Refresh Token 未提供");
        }
        String deviceId = req != null && req.deviceId() != null ? req.deviceId() : "default";
        return staffService.refresh(refreshToken, deviceId);
    }

    /** 当前登录员工信息 */
    @GetMapping("/me")
    public StaffInfo me() {
        return staffService.getMe(StaffContext.get());
    }

    /** 登出：删除当前设备 refresh token */
    @PostMapping("/logout")
    public void logout(@Valid @RequestBody LogoutRequest req) {
        staffService.logout(StaffContext.get(), req.deviceId());
    }

    public record LoginRequest(
            @NotBlank @Size(max = 50) String employeeNo,
            @NotBlank @Size(min = 8, max = 72) String password,
            @NotBlank @Size(max = 100) String deviceId) {
        public LoginRequest {
            if (employeeNo != null) employeeNo = employeeNo.trim();
        }
    }

    public record RefreshRequest(@Size(max = 200) String refreshToken, @Size(max = 100) String deviceId) {}

    public record LogoutRequest(@NotBlank @Size(max = 100) String deviceId) {}
}
