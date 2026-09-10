package com.shop.platform.infra.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
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
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * JWT 签发与验签。account 模块的买家与员工登录共用：kind claim 区分两类 subject，用户 token 的 subject 是 account.users.id，
 * 员工 token 的 subject 是 account.staff.id，两套 UUID 互不视为对方（各过滤链校验 kind）。
 */
@Component
@Slf4j
public class JwtProvider {
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final String CLAIM_TYPE = "type";
    private static final String TYPE_ACCESS = "access";
    private static final String CLAIM_KIND = "kind";
    private static final String KIND_USER = "user";
    private static final String KIND_STAFF = "staff";

    private final PrivateKey ecPrivateKey;
    private final PublicKey ecPublicKey;
    private final long accessExp;
    private final long staffExp;
    private final String issuer;
    private final String audience;

    public JwtProvider(JwtProperties props) {
        this.accessExp = props.getAccessTokenExpiration();
        this.staffExp = props.getStaffAccessTokenExpiration();
        this.issuer = props.getIssuer();
        this.audience = props.getAudience();

        // ES256 优先；未配置则开发环境自动生成临时密钥对
        if (StringUtils.hasText(props.getPrivateKey()) && StringUtils.hasText(props.getPublicKey())) {
            this.ecPrivateKey = parseEcPrivateKey(props.getPrivateKey());
            this.ecPublicKey = parseEcPublicKey(props.getPublicKey());
        } else {
            // 开发环境：启动时自动生成临时密钥对
            KeyPair kp = Jwts.SIG.ES256.keyPair().build();
            this.ecPrivateKey = kp.getPrivate();
            this.ecPublicKey = kp.getPublic();
            log.info("Auto-generated ephemeral ES256 key pair. Tokens invalidated on restart.");
        }
    }

    /** 签发用户 Access Token（JWT，带 jti/iss/aud/type/kind=user） */
    public String createAccessToken(UUID userId) {
        return buildToken(userId, KIND_USER);
    }

    /** 签发平台员工 Access Token（kind=staff），过期时长独立配置，比 C 端长 */
    public String createStaffAccessToken(UUID staffId) {
        return buildToken(staffId, KIND_STAFF);
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
            var parserBuilder = Jwts.parser().requireIssuer(issuer).verifyWith(ecPublicKey);
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

    /** 验证是否员工 token（kind=staff）；员工 token 不允许在用户链路使用 */
    public boolean isStaff(Claims claims) {
        return KIND_STAFF.equals(claims.get(CLAIM_KIND));
    }

    public UUID getUserId(Claims claims) {
        return UUID.fromString(claims.getSubject());
    }

    public String getExpectedAudience() {
        return audience;
    }

    // ---- private ----

    private String buildToken(UUID subjectId, String kind) {
        long expMs = KIND_STAFF.equals(kind) ? staffExp : accessExp;
        var builder = Jwts.builder()
                .subject(subjectId.toString())
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .claim(CLAIM_KIND, kind)
                .issuer(issuer)
                .audience()
                .add(audience)
                .and()
                .id(UUID.randomUUID().toString())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expMs));

        return builder.signWith(ecPrivateKey).compact();
    }

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
