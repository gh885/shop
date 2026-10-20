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
 * <p>令牌里<b>只放身份</b>（谁、哪个商家），不放权限和店铺范围。放进去就意味着改权限要等令牌过期才生效——
 * 淘宝那套也是每次请求重新取权限，缓存另算。
 */
@Component
public class AccessTokenIssuer {

    private final JwtEncoder encoder;

    private final JwtProperties properties;

    public AccessTokenIssuer(JwtEncoder encoder, JwtProperties properties) {
        this.encoder = encoder;
        this.properties = properties;
    }

    public String issue(UUID operatorId, UUID merchantId) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(operatorId.toString())
                .issuedAt(now)
                .expiresAt(now.plus(properties.accessTtl()));
        if (merchantId != null) {
            claims.claim("merchant_id", merchantId.toString());
        }

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
    }

    public long expiresInSeconds() {
        return properties.accessTtl().toSeconds();
    }
}
