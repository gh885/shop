package com.shop.platform.auth.infra;

/** 短信通道抽象，开发和生产环境各自实现。 */
public interface SmsChannel {

    /** 发送验证码，返回 true 表示发送成功 */
    boolean sendCode(String phone, String code);
}
