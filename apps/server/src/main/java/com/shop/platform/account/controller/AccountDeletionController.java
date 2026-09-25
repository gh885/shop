package com.shop.platform.account.controller;

import com.shop.platform.account.dto.ConfirmDeletionRequest;
import com.shop.platform.account.service.AccountDeletionService;
import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家自助注销账号（个保法第 47 条）。挂在 {@code /auth/**} 下与「账号自己的事」同域，
 * 且不在匿名豁免清单里（ACC-26）——四条口子全部要求已登录。
 *
 * <p>状态查询与撤销是普通读写；申请那条要多一枚发到绑定手机号的验证码（先 {@code POST /code} 再 {@code POST}）。
 */
@Tag(name = "account-deletion", description = "买家账号注销（申请 / 撤销 / 状态）")
@RestController
@RequestMapping("/auth/deletion")
@RequiredArgsConstructor
public class AccountDeletionController {

    private final AccountDeletionService deletionService;
    private final ClientIp clientIp;

    @Operation(summary = "注销状态")
    @GetMapping
    public AccountDeletionService.DeletionState deletionStatus(@CurrentUser UUID userId) {
        return deletionService.status(userId);
    }

    @Operation(summary = "发送注销验证码")
    @PostMapping("/code")
    public void sendDeletionCode(@CurrentUser UUID userId, HttpServletRequest servletRequest) {
        deletionService.sendCode(userId, clientIp.of(servletRequest));
    }

    @Operation(summary = "提交注销申请")
    @PostMapping
    public void requestDeletion(@CurrentUser UUID userId, @Valid @RequestBody ConfirmDeletionRequest body) {
        deletionService.request(userId, body.code());
    }

    @Operation(summary = "撤销注销申请")
    @DeleteMapping
    public void cancelDeletion(@CurrentUser UUID userId) {
        deletionService.cancel(userId);
    }
}
