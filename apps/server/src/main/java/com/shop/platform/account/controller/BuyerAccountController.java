package com.shop.platform.account.controller;

import com.shop.platform.account.dto.DeletionRequest;
import com.shop.platform.account.dto.SetPasswordRequest;
import com.shop.platform.account.dto.UpdateLocaleRequest;
import com.shop.platform.account.dto.UpdateProfileRequest;
import com.shop.platform.account.service.AccountDeletionService;
import com.shop.platform.account.service.BuyerAuthService;
import com.shop.platform.account.service.BuyerLocaleService;
import com.shop.platform.account.service.BuyerSessionService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.RefreshCookies;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家账号自服务：密码、昵称、设备、自助注销。全部要求已登录，判权不需要——
 * 「这是我的账号」由令牌背书，操作对象一律取当前操作人，不给 path 传 buyerId 的机会。
 */
@RestController
@RequestMapping("/api/buyer")
public class BuyerAccountController {

    private final BuyerAuthService auth;
    private final BuyerSessionService sessions;
    private final BuyerLocaleService locale;
    private final AccountDeletionService deletion;
    private final Authorizer authorizer;
    private final ClientIp clientIp;
    private final RefreshCookies refreshCookies;

    public BuyerAccountController(
            BuyerAuthService auth,
            BuyerSessionService sessions,
            BuyerLocaleService locale,
            AccountDeletionService deletion,
            Authorizer authorizer,
            ClientIp clientIp,
            RefreshCookies refreshCookies) {
        this.auth = auth;
        this.sessions = sessions;
        this.locale = locale;
        this.deletion = deletion;
        this.authorizer = authorizer;
        this.clientIp = clientIp;
        this.refreshCookies = refreshCookies;
    }

    /** 首次设置密码（无旧密码）或修改密码（需当前密码）。改密后全部设备下线。 */
    @PostMapping("/password")
    public void setPassword(@Valid @RequestBody SetPasswordRequest request) {
        auth.setPassword(authorizer.current().operatorId(), request.currentPassword(), request.newPassword());
    }

    /** 改昵称 */
    @PutMapping("/profile")
    public ProfileUpdated updateProfile(@Valid @RequestBody UpdateProfileRequest request) {
        return new ProfileUpdated(auth.updateDisplayName(authorizer.current().operatorId(), request.displayName()));
    }

    public record ProfileUpdated(String displayName) {}

    /**
     * 改语言偏好。返回归一后的标签（客户端送 {@code zh-CN} 会回 {@code zh-Hans-CN}），
     * 前端拿它回写本地 cookie，避免「本地存的和库里存的不是同一个串」。
     */
    @PutMapping("/locale")
    public LocaleUpdated updateBuyerLocale(@Valid @RequestBody UpdateLocaleRequest request) {
        return new LocaleUpdated(locale.update(authorizer.current().operatorId(), request));
    }

    public record LocaleUpdated(String preferredLocale) {}

    /** 设备列表：当前有效会话（设备名/IP/时间）。哪台是本机由前端拿自己的 deviceId 比，服务端没有答案。 */
    @GetMapping("/devices")
    public List<RefreshTokenStore.DeviceEntry> devices() {
        return sessions.devices(authorizer.current().operatorId());
    }

    /** 登出单台设备 */
    @DeleteMapping("/devices/{deviceId}")
    public void deleteDevice(@PathVariable String deviceId) {
        sessions.deleteDevice(authorizer.current().operatorId(), deviceId);
    }

    /** 登出所有设备（清空全端会话，当前请求也失效，需重新登录） */
    @PostMapping("/logout-all")
    public void logoutAll() {
        sessions.logoutAll(authorizer.current().operatorId());
    }

    // 自助注销（个保法第 47 条）

    /** 发注销验证码到本人手机号（号码取 token，不让前端自报，故无需图形验证码） */
    @PostMapping("/deletion/code")
    public void sendDeletionCode(jakarta.servlet.http.HttpServletRequest servletRequest) {
        deletion.sendCode(authorizer.current().operatorId(), clientIp.of(servletRequest));
    }

    /** 提交注销申请：冷静期内可撤销，期满匿名化 */
    @PostMapping("/deletion")
    public void requestDeletion(@Valid @RequestBody DeletionRequest request) {
        deletion.request(authorizer.current().operatorId(), request.code());
    }

    /** 撤销注销申请 */
    @DeleteMapping("/deletion")
    public void cancelDeletion() {
        deletion.cancel(authorizer.current().operatorId());
    }

    /** 注销状态：有没有待生效的申请、哪一刻生效、冷静期几天 */
    @GetMapping("/deletion")
    public AccountDeletionService.DeletionState deletionStatus() {
        return deletion.status(authorizer.current().operatorId());
    }
}
