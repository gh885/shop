package com.shop.platform.infra.security;

import java.util.List;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "shop.jwt")
public class JwtProperties {

    /** ES256 私钥（PKCS#8 base64），未配置则启动时自动生成；配置时 publicKey 必填 */
    private String privateKey;

    /** ES256 公钥（X.509 base64），privateKey 配置时必填 */
    private String publicKey;

    /** access_token 过期毫秒数，默认 10 分钟（5-15 分钟推荐范围） */
    private long accessTokenExpiration = 600_000;

    /** 平台员工（admin.staff）access_token 过期毫秒数，默认 8 小时（后台工作台，比 C 端长） */
    private long staffAccessTokenExpiration = 28_800_000;

    /** refresh_token 过期毫秒数，默认 7 天 */
    private long refreshTokenExpiration = 604_800_000;

    /** JWT 签发者 */
    private String issuer = "shop-platform";

    /** JWT 受众 */
    private String audience = "shop-api";

    /**
     * 不需要认证的路径（前缀匹配）。
     *
     * <p>买家侧的浏览接口（商品/类目/店铺）必须匿名可访问：未登录也要能逛。 注意只放开只读浏览，购物车/下单等 /api 下的写接口不在此列，逐个新增时不要图省事写 "/api"。
     */
    private List<String> skipPaths = List.of(
            "/api/products",
            "/api/categories",
            "/api/shops",
            "/api/cms",
            "/auth/captcha",
            "/auth/sms-code",
            "/auth/login/sms",
            "/auth/login/password",
            "/auth/refresh",
            "/auth/forgot-password",
            "/auth/reset-password",
            "/admin",
            // 运维端点匿名可达（Prometheus 抓取无 token）；生产由网关限制来源
            "/actuator");
}
