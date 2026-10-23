package com.shop.platform.account.internal;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 开发环境人机验证直通：固定码 {@value #DEV_CODE} 直通，给本地联调与 E2E 每轮注册新账号用。
 *
 * <p>必须显式配置 shop.auth.captcha-channel=dev 才会装配：生产不配这个属性 bean 就不存在，
 * 直通分支恒假。该直通只免掉「比对」这一步，不免掉「必须提交过人机验证」——
 * 缺参仍一律 400（见 {@link CaptchaService#verify}），后门边界不能画错地方。
 */
@Component
@ConditionalOnProperty(name = "shop.auth.captcha-channel", havingValue = "dev")
public class DevCaptchaChannel {

    public static final String DEV_CODE = "DEVOK";
}
