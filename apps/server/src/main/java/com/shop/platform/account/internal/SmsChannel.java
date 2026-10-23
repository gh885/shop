package com.shop.platform.account.internal;

/**
 * 短信通道 SPI。账号模块自己的人机管道（登录/找回/注销验证码都从这走），
 * 真实通道（阿里云/腾讯云）接入时实现本接口替换 dev 那个。
 */
public interface SmsChannel {

    /** 发送一条验证码短信。返回是否受理；失败抛异常，不吞成 false。 */
    boolean sendCode(String phone, String text);
}
