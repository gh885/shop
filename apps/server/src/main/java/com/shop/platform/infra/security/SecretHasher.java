package com.shop.platform.infra.security;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 带 pepper 的 HMAC-SHA256 摘要：短信验证码、refresh token 落 Redis 前的脱敏。
 *
 * <p>为什么不用裸 SHA-256：哈希的安全性取决于输入熵。refresh token 是 32 字节随机数，裸 SHA-256 已不可枚举；
 * 但验证码只有 10^6 种可能且手机号就在 key 里，全量拖库后裸 SHA-256 可离线秒破。HMAC 引入服务端 pepper
 * （存应用配置而非 Redis）后，「拖库」必须升级为「拖库 + 攻陷应用配置」才能开始猜解。
 *
 * <p>pepper 未配置时启动生成临时值并告警——重启后所有在途验证码与 refresh token 失效，仅限开发环境；
 * 生产必须显式配置（openssl rand -hex 32），过短直接启动失败。
 */
@Component
@Slf4j
public class SecretHasher {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final byte[] pepper;

    public SecretHasher(@Value("${shop.security.pepper:}") String configuredPepper) {
        if (StringUtils.hasText(configuredPepper)) {
            if (configuredPepper.length() < 32) {
                throw new IllegalStateException("shop.security.pepper 至少 32 字符（openssl rand -hex 32）");
            }
            this.pepper = configuredPepper.getBytes(StandardCharsets.UTF_8);
        } else {
            byte[] ephemeral = new byte[32];
            SECURE_RANDOM.nextBytes(ephemeral);
            this.pepper = ephemeral;
            log.warn("shop.security.pepper 未配置，启用临时 pepper：重启后在途验证码与 refresh token 全部失效（仅限开发环境）");
        }
    }

    /** HMAC-SHA256 hex 摘要 */
    public String hash(String input) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(pepper, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }
}
