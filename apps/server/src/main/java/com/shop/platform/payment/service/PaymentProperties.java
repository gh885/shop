package com.shop.platform.payment.service;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 支付渠道选择。
 *
 * <p>{@code channel} 是<b>当前生效的默认渠道</b>：MOCK（默认，无外部 IO）或 ALIPAY。
 * 一旦配成 ALIPAY 而渠道未装配 / 密钥不全，应用启动失败——支付降级会留下「没付也能确认」的后门，
 * 静默回落 MOCK 比起不来更坏。
 */
@Data
@ConfigurationProperties(prefix = "shop.payment")
public class PaymentProperties {

    /** 默认支付渠道：MOCK / ALIPAY */
    private String channel = "MOCK";
}
