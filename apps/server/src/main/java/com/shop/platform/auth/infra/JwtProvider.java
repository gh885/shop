package com.shop.platform.auth.infra;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.SecretKey;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class JwtProvider {
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final String CLAIM_TYPE = "type";
    private static final String TYPE_ACCESS = "access";

    private final boolean isHs256;
    private final SecretKey hmacKey;
    private final PrivateKey ecPrivateKey;
    private final PublicKey ecPublicKey;
    private final long accessExp;
    private final String issuer;
    private final String audience;

    public JwtProvider(JwtProperties props) {
        this.accessExp = props.getAccessTokenExpiration();
        this.issuer = props.getIssuer();
        this.audience = props.getAudience();

        // ES256 优先；HS256 仅限原型/玩具项目（冲突裁决 #6）
        if (StringUtils.hasText(props.getPrivateKey())
                && StringUtils.hasText(props.getPublicKey())) {
            this.hmacKey = null;
            this.ecPrivateKey = parseEcPrivateKey(props.getPrivateKey());
            this.ecPublicKey = parseEcPublicKey(props.getPublicKey());
            this.isHs256 = false;
        } else if (StringUtils.hasText(props.getSecret())) {
            this.hmacKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(props.getSecret().trim()));
            this.ecPrivateKey = null;
            this.ecPublicKey = null;
            this.isHs256 = true;
            log.warn(
                    "Using HS256 — only suitable for prototypes; configure ES256 keys for production");
        } else {
            // 开发环境：启动时自动生成临时密钥对
            KeyPair kp = Jwts.SIG.ES256.keyPair().build();
            this.hmacKey = null;
            this.ecPrivateKey = kp.getPrivate();
            this.ecPublicKey = kp.getPublic();
            this.isHs256 = false;
            log.info("Auto-generated ephemeral ES256 key pair. Tokens invalidated on restart.");
        }
    }

    /** 签发 Access Token（JWT，带 jti/iss/aud/type） */
    public String createAccessToken(UUID userId) {
        var builder =
                Jwts.builder()
                        .subject(userId.toString())
                        .claim(CLAIM_TYPE, TYPE_ACCESS)
                        .issuer(issuer)
                        .audience()
                        .add(audience)
                        .and()
                        .id(UUID.randomUUID().toString())
                        .issuedAt(new Date())
                        .expiration(new Date(System.currentTimeMillis() + accessExp));

        if (isHs256) {
            builder.signWith(hmacKey);
        } else {
            builder.signWith(ecPrivateKey);
        }
        return builder.compact();
    }

    /** 生成不透明 Refresh Token（高熵 32 字节 hex，前缀 rt:） */
    public String generateRefreshToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return "rt:" + HexFormat.of().formatHex(bytes);
    }

    /** 验签并解析 claims。 自动校验签名、issuer、过期时间；过期 token 仍返回 claims 供调用方判断。 */
    public Claims parse(String token) {
        try {
            var parserBuilder = Jwts.parser().requireIssuer(issuer);
            if (isHs256) {
                parserBuilder.verifyWith(hmacKey);
            } else {
                parserBuilder.verifyWith(ecPublicKey);
            }
            return parserBuilder.build().parseSignedClaims(token).getPayload();
        } catch (ExpiredJwtException e) {
            return e.getClaims();
        } catch (JwtException e) {
            return null;
        }
    }

    /** 判断 claims 是否已过期 */
    public boolean isExpired(Claims claims) {
        return claims.getExpiration() != null && claims.getExpiration().before(new Date());
    }

    /** 验证是否 Access Token 类型 */
    public boolean isAccessToken(Claims claims) {
        return TYPE_ACCESS.equals(claims.get(CLAIM_TYPE));
    }

    public UUID getUserId(Claims claims) {
        return UUID.fromString(claims.getSubject());
    }

    public String getExpectedAudience() {
        return audience;
    }

    // ---- private ----

    private static PrivateKey parseEcPrivateKey(String b64) {
        try {
            byte[] bytes = Base64.getDecoder().decode(b64.trim());
            return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(bytes));
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid ES256 private key (base64 PKCS#8)", e);
        }
    }

    private static PublicKey parseEcPublicKey(String b64) {
        try {
            byte[] bytes = Base64.getDecoder().decode(b64.trim());
            return KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(bytes));
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid ES256 public key (base64 X.509)", e);
        }
    }
}
