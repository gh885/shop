package com.shop.platform.infra.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 安全杂项配置。
 *
 * @param pepper HMAC-SHA256 的服务端 pepper：短信验证码、refresh token 落 Redis 前的摘要密钥。
 *               只从环境变量或 {@code apps/server/.env} 来（openssl rand -hex 32）；未配置时启动生成
 *               临时值并告警——重启后在途验证码与 refresh token 全部失效，仅限开发环境。
 */
@ConfigurationProperties("shop.security")
public record SecretProperties(String pepper) {}
