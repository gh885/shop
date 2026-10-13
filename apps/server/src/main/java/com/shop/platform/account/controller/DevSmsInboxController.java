package com.shop.platform.account.controller;

import com.shop.platform.account.infra.DevSmsChannel;
import com.shop.platform.account.infra.DevSmsMessage;
import io.swagger.v3.oas.annotations.Hidden;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 开发态虚拟短信收件箱：按手机号列出 {@link DevSmsChannel}「发出」的验证码文案，
 * 本地联调不用翻日志（登录/重置/注销/将来的激活码都进同一个收件箱）。
 *
 * <p>与 {@link DevSmsChannel} 同一条件装配（sms-channel=dev）：生产不存在这条路由。
 * 匿名可达（在 JwtProperties.skipPaths 里）——请求验证码时本来就还没登录，收件箱若要求登录就自相矛盾。
 * 刻意不进对外契约（`@Hidden`），它不是给 SDK 调的接口。
 */
@Hidden
@RestController
@RequestMapping("/dev/sms-inbox")
@ConditionalOnProperty(name = "shop.auth.sms-channel", havingValue = "dev")
@RequiredArgsConstructor
public class DevSmsInboxController {

    private final DevSmsChannel devSmsChannel;

    /** 最近「收到」的短信（新在前，至多 5 条，10 分钟内有效） */
    @GetMapping("/{phone}")
    public List<DevSmsMessage> recentMessages(@PathVariable String phone) {
        return devSmsChannel.recentMessages(phone);
    }
}
