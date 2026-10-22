package com.shop.platform.infra.security;

import java.time.Instant;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

/**
 * 签发访问令牌。签名和安全头都交给 {@code NimbusJwtEncoder}，这里只决定放哪些声明。
 *
 * <p>令牌里<b>只放身份</b>（谁、哪类身份、哪个商家），不放权限和店铺范围。放进去就意味着改权限要等令牌过期才生效——
 * 淘宝那套也是每次请求重新取权限，缓存另算。
 *
 * <p>{@code typ} 声明是必须的：三套身份域共用一把签名密钥，没有它，一个买家的 subject
 * 被拿去查 {@code seller.operator} 也不会报错——只要 id 撞上就成了一次越权。带上类型，
 * 解析时只走对应那一个 resolver，撞 id 也进不去。
 */
@Component
public class AccessTokenIssuer {

    private final JwtEncoder encoder;

    private final JwtProperties properties;

    public AccessTokenIssuer(JwtEncoder encoder, JwtProperties properties) {
        this.encoder = encoder;
        this.properties = properties;
    }

    /** 卖家/员工：带商家归属。 */
    public String issue(UUID operatorId, String operatorType, UUID merchantId) {
        JwtClaimsSet.Builder claims = base(operatorId, operatorType);
        if (merchantId != null) {
            claims.claim("merchant_id", merchantId.toString());
        }
        return encode(claims.build());
    }

    /** 买家：没有商家、没有店铺范围。 */
    public String issue(UUID operatorId, String operatorType) {
        return issue(operatorId, operatorType, null);
    }

    public long expiresInSeconds() {
        return properties.accessTtl().toSeconds();
    }

    private JwtClaimsSet.Builder base(UUID operatorId, String operatorType) {
        if (operatorType == null || operatorType.isBlank()) {
            throw new IllegalArgumentException("签发令牌必须指定身份类型，否则解析时不知道该查哪张表");
        }
        Instant now = Instant.now();
        return JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(operatorId.toString())
                .claim("typ", operatorType)
                .issuedAt(now)
                .expiresAt(now.plus(properties.accessTtl()));
    }

    private String encode(JwtClaimsSet claims) {
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}
