package com.shop.platform.account.controller;

import com.shop.platform.account.AuthProperties;
import com.shop.platform.account.dto.LogoutRequest;
import com.shop.platform.account.dto.RefreshRequest;
import com.shop.platform.account.dto.SubaccountActivateRequest;
import com.shop.platform.account.dto.SubaccountChangePasswordRequest;
import com.shop.platform.account.dto.SubaccountLoginRequest;
import com.shop.platform.account.dto.SubaccountSmsCodeRequest;
import com.shop.platform.account.service.SubaccountService;
import com.shop.platform.account.service.SubaccountView;
import com.shop.platform.infra.security.TokenPair;
import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.CurrentSubaccount;
import com.shop.platform.infra.web.RefreshCookies;
import com.shop.platform.infra.web.RequestPaths;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家子账号认证（{@code kind=subaccount}）：激活 / 口令登录 / 刷新 / 登出 / 自述 / 自助改密。
 *
 * <p>挂在 {@code /auth/subaccount} 而不是 {@code /seller/auth}：子账号只吃认证不吃授权，
 * 而 {@code /seller} 是受判权保护的命名空间——进去就要么给每个自助端点写 {@code @RequirePermission}
 * （子账号会因为没这个码连登出都做不到），要么给命名空间再开一份自服务豁免清单
 * （命名空间的词表就有了第二处定义）。{@code /auth} 本来就不在受保护命名空间里，不需要任何豁免。
 *
 * <p>业务请求不在这里：子账号的卖家侧操作走 {@code /seller/**}（令牌由 SubaccountAuthFilter 收）。
 *
 * <p>refresh cookie 与买家那只完全分开（名 {@code subaccount_refresh_token}、path 收窄到本前缀下的
 * refresh 端点）：子账号是工作身份，登进工作台不该把同浏览器里买家的会话顶掉，也不该被买家登出带走。
 * 这是「共享会话（ACC-27）」的刻意例外——共享解决的是「店主一处登录两处可用」，子账号没有这个诉求。
 *
 * <p>图形验证码不另开端点：激活发码要的那一枚走买家侧同一个 {@code GET /auth/captcha}。
 */
@Tag(name = "subaccount-auth", description = "卖家子账号认证（激活 / 登录 / 会话）")
@RestController
@RequestMapping("/auth/subaccount")
@RequiredArgsConstructor
public class SubaccountAuthController {

    private final SubaccountService subaccountService;
    private final ClientIp clientIp;
    private final RefreshCookies refreshCookies;
    private final AuthProperties authProperties;

    /** 子账号 refresh cookie：独立名字与独立 path，与买家/员工那两只互不覆盖 */
    private RefreshCookies.Spec cookieSpec() {
        return new RefreshCookies.Spec(
                "subaccount_refresh_token",
                RequestPaths.SUBACCOUNT_AUTH_PREFIX + "refresh",
                authProperties.refreshCookieDomain());
    }

    /**
     * 发送激活验证码（匿名可达，需图形验证码）。人机验证码取 {@code GET /auth/captcha}——
     * 与买家发码共用同一只图形码通道，不为子账号另开一套。
     */
    @PostMapping("/sms-code")
    public void sendActivationCode(@Valid @RequestBody SubaccountSmsCodeRequest req, HttpServletRequest request) {
        subaccountService.sendActivationCode(
                req.loginName(), req.phone(), req.captchaId(), req.captchaCode(), clientIp.of(request));
    }

    /** 激活（首次登录）：验本人手机号，成功即签发会话 */
    @PostMapping("/activate")
    public TokenPair activate(
            @Valid @RequestBody SubaccountActivateRequest req,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
            HttpServletRequest request,
            HttpServletResponse response) {
        TokenPair result = subaccountService.activate(
                req.loginName(), req.phone(), req.code(), req.deviceId(), clientIp.of(request), userAgent);
        refreshCookies.issue(response, cookieSpec(), result.refreshToken());
        return result;
    }

    /** 口令登录。待激活拿 403 + SUBACCOUNT_NOT_ACTIVATED，前端据此切到激活步骤 */
    @PostMapping("/login")
    public TokenPair login(
            @Valid @RequestBody SubaccountLoginRequest req,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
            HttpServletRequest request,
            HttpServletResponse response) {
        TokenPair result = subaccountService.login(
                req.loginName(), req.password(), req.deviceId(), clientIp.of(request), userAgent);
        refreshCookies.issue(response, cookieSpec(), result.refreshToken());
        return result;
    }

    /** 刷新（Cookie 优先、Body 兜底，与买家端同一套读法）；方法名带主体前缀——operationId 必须全局唯一 */
    @PostMapping("/refresh")
    public TokenPair refreshSubaccountSession(
            HttpServletRequest request,
            HttpServletResponse response,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
            @RequestBody(required = false) RefreshRequest req) {
        String refreshToken =
                refreshCookies.requireToken(request, cookieSpec(), req == null ? null : req.refreshToken());
        TokenPair result = subaccountService.refresh(
                refreshToken, req == null ? null : req.deviceId(), clientIp.of(request), userAgent);
        refreshCookies.issue(response, cookieSpec(), result.refreshToken());
        return result;
    }

    /** 登出（吊销当前设备的 refresh 并清 cookie） */
    @PostMapping("/logout")
    public void logoutSubaccount(
            @CurrentSubaccount UUID subaccountId, @Valid @RequestBody LogoutRequest req, HttpServletResponse response) {
        subaccountService.logout(subaccountId, req.deviceId());
        refreshCookies.clear(response, cookieSpec());
    }

    /**
     * 当前子账号（工作台自述：哪个店、什么登录名、有哪些权限码）。
     *
     * <p>自述与续期这三个方法都带主体前缀：operationId 取方法名且全局唯一（apps/server/AGENTS.md）。
     * 与买家的 {@code me} / {@code refresh} / {@code logout} 同名时，生成器会把<b>买家</b>那三个改名成
     * {@code me_1} 之类——一次纯后端的子系统改动顺手破坏另一端 SDK，而且只有跑 typecheck 才发现。
     */
    @GetMapping("/me")
    public SubaccountView getSubaccountMe(@CurrentSubaccount UUID subaccountId) {
        return SubaccountView.from(subaccountService.requireById(subaccountId));
    }

    /** 自助改密：需当前口令；改完全端会话吊销（与买家改密同一后果，ACC-24） */
    @PostMapping("/password")
    public void changePassword(
            @CurrentSubaccount UUID subaccountId, @Valid @RequestBody SubaccountChangePasswordRequest req) {
        subaccountService.changePassword(subaccountId, req.currentPassword(), req.newPassword());
    }
}
