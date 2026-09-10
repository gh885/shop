package com.shop.platform.account.infra;

import com.shop.platform.common.PhoneNumber;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 开发环境短信通道：验证码只打日志，另提供固定码供本地联调。
 *
 * <p>必须显式配置 shop.auth.sms-channel=dev 才会装配（matchIfMissing=false）：
 * 生产漏配真实通道时启动即失败，而不是静默启用固定码后门。
 */
@Component
@ConditionalOnProperty(name = "shop.auth.sms-channel", havingValue = "dev")
@Slf4j
public class DevSmsChannel implements SmsChannel {

    /** 开发环境固定验证码 */
    private static final String DEV_CODE = "666666";

    @Override
    public boolean sendCode(String phone, String code) {
        log.info("[SMS] 发送验证码到 {}: {}（开发环境固定码: {}）", PhoneNumber.mask(phone), code, DEV_CODE);
        return true;
    }

    public String getDevCode() {
        return DEV_CODE;
    }
}
