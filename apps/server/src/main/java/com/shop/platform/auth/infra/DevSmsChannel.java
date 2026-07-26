package com.shop.platform.auth.infra;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "shop.auth.sms-channel", havingValue = "dev", matchIfMissing = true)
@Slf4j
public class DevSmsChannel implements SmsChannel {

    /** 开发环境固定验证码 */
    private static final String DEV_CODE = "666666";

    @Override
    public boolean sendCode(String phone, String code) {
        log.info("[SMS] 发送验证码到 {}: {}（开发环境固定码: {}）", phone, code, DEV_CODE);
        return true;
    }

    public String getDevCode() {
        return DEV_CODE;
    }
}
