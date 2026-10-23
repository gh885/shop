package com.shop.platform.account.internal;

import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 开发态虚拟短信收件箱：请求验证码时还没登录，必须匿名可达（PUBLIC_PATHS 已放行）。
 * 生产不存在这条路由（sms-channel=dev 才装配），留路径常量无副作用。
 */
@RestController
@ConditionalOnBean(DevSmsChannel.class)
public class DevSmsInboxController {

    private final DevSmsChannel channel;

    public DevSmsInboxController(DevSmsChannel channel) {
        this.channel = channel;
    }

    /** 最近「收到」的短信，新在前 */
    @GetMapping("/api/dev/sms-inbox")
    public List<DevSmsMessage> inbox(@RequestParam String phone) {
        return channel.recentMessages(phone);
    }
}
