package com.shop.platform.account;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 账号模块的认证配置。
 *
 * @param dormantLoginDays 休眠判定窗口（天）：账号这么久没有登录/续期且设有密码，就不再吃短信通道
 *        （短信登录与短信找回都不放行）。号码被电信回收再放号后，新机主凭收到的验证码接管旧账号是
 *        真实攻击面；有密码的账号退回密码通道，没密码的账号没有可保护的东西，短信照常。设 0 关闭。
 * @param smsIpDistinctPhonesMax 单 IP 每日不同手机号上限：验证码发送是匿名端点，IP+每号频控挡不住
 *        「一个 IP 横扫大量不同号码」的轰炸——每号都只发一条、不触发日限，成本却由被轰炸的号码承担。
 * @param deletionCoolingOffDays 自助注销的冷静期（天）：申请只落时刻，期满由扫描器匿名化。
 */
@ConfigurationProperties("shop.auth.account")
public record AccountProperties(int dormantLoginDays, int smsIpDistinctPhonesMax, int deletionCoolingOffDays) {

    public AccountProperties {
        if (dormantLoginDays < 0) {
            throw new IllegalStateException("shop.auth.account.dormant-login-days 不能为负");
        }
        if (smsIpDistinctPhonesMax <= 0) {
            throw new IllegalStateException("shop.auth.account.sms-ip-distinct-phones-max 必须为正");
        }
        if (deletionCoolingOffDays <= 0) {
            throw new IllegalStateException("shop.auth.account.deletion-cooling-off-days 必须为正");
        }
    }

    @Configuration
    @EnableConfigurationProperties(AccountProperties.class)
    static class Registration {}
}
