package com.shop.platform.infra.security;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 令牌配置。
 *
 * <p>{@code secret} 没有默认值，也<b>不允许</b>有默认值：默认密钥进仓库等于所有人共用一把锁。启动时校验长度，
 * HS256 的密钥短于 32 字节等于纸糊的锁。
 *
 * @param secret HS256 签名密钥，至少 32 字节；只从环境变量或 {@code apps/server/.env} 来
 * @param issuer 签发方，解码时校验，防止别的系统签的令牌被当成我们的
 * @param accessTtl 访问令牌有效期
 */
@ConfigurationProperties("shop.auth.jwt")
public record JwtProperties(String secret, String issuer, Duration accessTtl) {

    private static final int MIN_SECRET_BYTES = 32;

    public JwtProperties {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("缺少 shop.auth.jwt.secret：本地放到 apps/server/.env，部署走平台环境变量");
        }
        if (secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("shop.auth.jwt.secret 至少 " + MIN_SECRET_BYTES + " 字节（HS256 强度要求）");
        }
        if (issuer == null || issuer.isBlank()) {
            throw new IllegalStateException("缺少 shop.auth.jwt.issuer");
        }
        accessTtl = accessTtl == null ? Duration.ofHours(2) : accessTtl;
    }
}
