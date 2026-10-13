package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.jsonwebtoken.Claims;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * JWT 签发与验签单测。安全属性：kind 隔离（用户/员工令牌互不冒认）、防篡改、
 * 过期 token 特殊契约（parse 返回 claims 交调用方判断而非直接抛）。
 */
class JwtProviderTest {

    private final JwtProvider provider = new JwtProvider(new JwtProperties());

    @Test
    void 用户令牌_签发后解析回同一主体() {
        UUID userId = UUID.randomUUID();
        String token = provider.createAccessToken(userId);

        Claims claims = provider.parse(token);
        assertThat(claims).isNotNull();
        assertThat(provider.getUserId(claims)).isEqualTo(userId);
        assertThat(provider.isAccessToken(claims)).isTrue();
        assertThat(provider.kindOf(claims)).isEqualTo(TokenKind.USER);
    }

    @Test
    void 员工令牌_kind隔离_用户链路不可用() {
        UUID staffId = UUID.randomUUID();
        String token = provider.createStaffAccessToken(staffId);

        Claims claims = provider.parse(token);
        assertThat(provider.kindOf(claims)).isEqualTo(TokenKind.STAFF);
        assertThat(provider.isAccessToken(claims)).isTrue();
    }

    @Test
    void 子账号令牌_kind隔离_第三种主体() {
        UUID subaccountId = UUID.randomUUID();
        String token = provider.createSubaccountAccessToken(subaccountId);

        Claims claims = provider.parse(token);
        assertThat(claims).isNotNull();
        assertThat(provider.getUserId(claims)).isEqualTo(subaccountId);
        // 子账号寿命刻意与 C 端同档（10 分钟）：停用即时生效靠判权每请求查库，不靠令牌短命
        assertThat(provider.kindOf(claims)).isEqualTo(TokenKind.SUBACCOUNT);
        assertThat(provider.isAccessToken(claims)).isTrue();
    }

    @Test
    void 篡改与垃圾令牌_解析为null() {
        String valid = provider.createAccessToken(UUID.randomUUID());

        // 篡改 payload 尾部
        assertThat(provider.parse(valid.substring(0, valid.length() - 2) + "xx"))
                .isNull();
        assertThat(provider.parse("not.a.jwt")).isNull();
        // refresh token 是不透明串，不是 JWT，混进 access 链路必须被拒
        assertThat(provider.parse(provider.generateRefreshToken())).isNull();
    }

    @Test
    void 过期令牌_parse仍返回claims_由isExpired判定() {
        JwtProperties props = new JwtProperties();
        props.setAccessTokenExpiration(-1); // 立即过期
        JwtProvider expiredProvider = new JwtProvider(props);

        String token = expiredProvider.createAccessToken(UUID.randomUUID());
        Claims claims = expiredProvider.parse(token);

        // 特殊契约：过期不算格式错误，claims 带回来让过滤链统一走 isExpired 分支
        assertThat(claims).isNotNull();
        assertThat(expiredProvider.isExpired(claims)).isTrue();
        // 正常令牌不过期
        assertThat(provider.isExpired(provider.parse(provider.createAccessToken(UUID.randomUUID()))))
                .isFalse();
    }

    @Test
    void 刷新令牌_前缀与熵() {
        String rt1 = provider.generateRefreshToken();
        String rt2 = provider.generateRefreshToken();

        assertThat(rt1).startsWith("rt:").hasSize("rt:".length() + 64); // 32 字节 hex
        assertThat(rt1).isNotEqualTo(rt2); // 随机性
    }

    @Test
    void 密钥配置不完整_启动即拒绝避免悄悄退回临时密钥() {
        JwtProperties onlyPrivate = new JwtProperties();
        onlyPrivate.setPrivateKey("private");
        JwtProperties onlyPublic = new JwtProperties();
        onlyPublic.setPublicKey("public");

        assertThatThrownBy(() -> new JwtProvider(onlyPrivate))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("configured together");
        assertThatThrownBy(() -> new JwtProvider(onlyPublic))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("configured together");
    }

    @Test
    void 临时密钥对_跨实例验签必须失败() {
        // 无 key 配置时各实例独立生成 ES256 密钥对：本实例签发自洽，
        // 跨实例（模拟重启换钥匙）旧 token 必须作废——这正是"临时密钥重启失效"的安全语义
        JwtProvider otherInstance = new JwtProvider(new JwtProperties());
        String token = provider.createAccessToken(UUID.randomUUID());

        assertThat(provider.parse(token)).isNotNull();
        assertThat(otherInstance.parse(token)).isNull();
    }
}
