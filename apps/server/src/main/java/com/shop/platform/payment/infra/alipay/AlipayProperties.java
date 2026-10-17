package com.shop.platform.payment.infra.alipay;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 支付宝渠道配置。密钥走环境变量注入，绝不写死进代码 / 仓库。
 *
 * <p>默认 {@code enabled=false}，此时 {@link #available()} 为 false，{@link AlipayGateway} 不会被装配进渠道表，
 * 应用照常以 MOCK 渠道启动——本地开发零配置可跑。一旦显式把 {@code shop.payment.channel} 配成 ALIPAY，
 * 密钥缺失就是启动失败而不是静默回落：支付降级会留下「没付也能确认」的后门，宁可起不来。
 */
@Data
@ConfigurationProperties(prefix = "shop.payment.alipay")
public class AlipayProperties {

    /** 是否启用支付宝渠道（缺密钥时保持 false） */
    private boolean enabled;

    /** 沙箱 / 正式环境的应用 APPID */
    private String appId;

    /** 应用私钥（PKCS#8，Base64，不含 PEM 头尾） */
    private String privateKey;

    /** 支付宝公钥（X.509，Base64，不含 PEM 头尾），用于验证支付宝的响应与回调 */
    private String publicKey;

    /** 网关地址：沙箱与生产不同，必须显式配置 */
    private String gatewayUrl = "https://openapi-sandbox.dl.alipaydev.com/gateway.do";

    /** 异步通知地址：必须公网可达；dev 留空时只靠主动查询确认 */
    private String notifyUrl;

    /** 同步回跳地址：浏览器回跳，可以填 localhost */
    private String returnUrl;

    /** 电脑网站支付的 product_code */
    private String productCode = "FAST_INSTANT_TRADE_PAY";

    /** 渠道可用性 = 开关打开且三个必填项齐全 */
    public boolean available() {
        return enabled && hasText(appId) && hasText(privateKey) && hasText(publicKey) && hasText(gatewayUrl);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
