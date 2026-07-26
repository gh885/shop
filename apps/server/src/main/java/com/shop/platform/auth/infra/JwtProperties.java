package com.shop.platform.auth.infra;

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

    /** 向下兼容的 HMAC 密钥（仅限原型/玩具项目，冲突裁决 #6） */
    private String secret;

    /** access_token 过期毫秒数，默认 10 分钟（5-15 分钟推荐范围） */
    private long accessTokenExpiration = 600_000;

    /** refresh_token 过期毫秒数，默认 7 天 */
    private long refreshTokenExpiration = 604_800_000;

    /** JWT 签发者 */
    private String issuer = "shop-platform";

    /** JWT 受众 */
    private String audience = "shop-api";

    /** 不需要认证的路径 */
    private List<String> skipPaths =
            List.of(
                    "/auth/sms-code",
                    "/auth/login/sms",
                    "/auth/login/password",
                    "/auth/refresh",
                    "/auth/forgot-password",
                    "/auth/reset-password");
}
