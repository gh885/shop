package com.shop.platform.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * 认证模块配置（{@code shop.auth}）。
 *
 * <p>{@code enabled} 与 {@code smsChannel} 仍由 {@code @ConditionalOnProperty} 按字符串消费
 * （装配开关先于绑定发生，读不到本记录），在此登记是为了让 {@code shop.auth} 的配置面完整可见——
 * 配置项只在注解字符串里出现时，既没有元数据也没人能一眼看全。
 *
 * @param enabled 模块总开关，见 {@link AuthModuleConfig}
 * @param smsChannel 短信通道标识；{@code dev} 装配固定码通道（仅本地），生产须为真实通道
 * @param refreshCookieDomain refresh cookie 的 Domain。留空 = 不设 domain（本地 localhost）；
 *     生产配成共享父域（如 {@code .example.com}）后买家端与卖家端共用 refresh cookie，
 *     登录一处另一处自动登录。admin 走独立 staff 账号体系，不纳入共享。
 * @param smsIpDistinctPhonesMax 每 IP 每日不同手机号上限（防单 IP 横扫轰炸）。默认 30：CGNAT /
 *     公司出口 / 校园网下大量真实用户共享同一出口 IP，阈值太低会把正常注册挡在门外。
 */
@ConfigurationProperties("shop.auth")
public record AuthProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("") String smsChannel,
        @DefaultValue("") String refreshCookieDomain,
        @DefaultValue("30") int smsIpDistinctPhonesMax) {}
