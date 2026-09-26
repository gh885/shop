package com.shop.platform.account.infra;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 开发环境的图形验证码直通通道：配了 shop.auth.captcha-channel=dev 才提供固定码，让 {@link CaptchaService#verify}
 * 跳过比对。存在的理由只有一个——E2E 与联调要每轮注册新账号，而认 PNG 不是自动化能稳定做的事。
 *
 * <p>必须显式配置才装配（matchIfMissing=false），与 {@link DevSmsChannel} 同一口径：生产漏配
 * {@code SHOP_AUTH_CAPTCHA_CHANNEL} 时 bean 不在，{@code CaptchaService} 里根本没有这条路径，
 * 而不是静默留一个后门。图照常渲染（{@code generate()} 不受影响），前端流程与生产一致。
 *
 * <p>固定码取 {@code DEV4}：四个字符都在 {@link CaptchaService} 的字符表里，与真人识别出的码同形，
 * 不需要给校验前的形状门开特例。
 */
@Component
@ConditionalOnProperty(name = "shop.auth.captcha-channel", havingValue = "dev")
public class DevCaptchaChannel {

    /** 开发环境固定图形验证码 */
    private static final String DEV_CODE = "DEV4";

    public String getDevCode() {
        return DEV_CODE;
    }
}
