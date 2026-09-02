package com.shop.platform.infra.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * 服务端密钥材料（{@code shop.security}）。
 *
 * @param pepper HMAC-SHA256 的服务端 pepper：验证码 / refresh token 落 Redis 前的脱敏密钥。
 *     留空时 {@link SecretHasher} 生成临时值并告警（仅限开发环境）；生产必须显式配置
 *     （{@code openssl rand -hex 32}），长度校验在 {@link SecretHasher} 构造期做——
 *     那里同时承担「未配置则降级」的分支，校验与降级同处一地才不会漂移。
 */
@ConfigurationProperties("shop.security")
public record SecretProperties(@DefaultValue("") String pepper) {}
