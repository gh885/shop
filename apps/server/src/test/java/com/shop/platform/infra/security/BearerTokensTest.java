package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.infra.security.BearerTokens.Verification;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Bearer 令牌验证链单测（JwtAuthFilter / StaffAuthFilter 共用的收口逻辑）。
 * 安全属性：kind 双向隔离——员工令牌混进用户链路、用户令牌混进管理端链路都必须被拒；
 * 失败短路顺序：无头(code=null) → 验签 → type → kind → audience。
 */
class BearerTokensTest {

    private final JwtProvider provider = new JwtProvider(new JwtProperties());

    private HttpServletRequest requestWith(String authorization) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (authorization != null) {
            request.addHeader("Authorization", authorization);
        }
        return request;
    }

    @Test
    void 无Authorization头_失败且code为null() {
        Verification v = BearerTokens.verify(provider, requestWith(null), false);

        assertThat(v.failed()).isTrue();
        assertThat(v.subjectId()).isNull();
        // code=null 表示「未登录」而非「令牌无效」，前端据此区分拉登录还是报错
        assertThat(v.code()).isNull();
        assertThat(v.detail()).isEqualTo("请先登录");
    }

    @Test
    void 垃圾令牌_INVALID_TOKEN() {
        Verification v = BearerTokens.verify(provider, requestWith("Bearer garbage"), false);

        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void 用户令牌走用户链路_放行并带出subject() {
        UUID userId = UUID.randomUUID();

        Verification v =
                BearerTokens.verify(provider, requestWith("Bearer " + provider.createAccessToken(userId)), false);

        assertThat(v.failed()).isFalse();
        assertThat(v.subjectId()).isEqualTo(userId);
    }

    @Test
    void 员工令牌混入用户链路_拒绝() {
        String staffToken = provider.createStaffAccessToken(UUID.randomUUID());

        Verification v = BearerTokens.verify(provider, requestWith("Bearer " + staffToken), false);

        // 安全属性：staff 的 subject 是 account.staff.id，绝不能落进 userIdHolder
        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void 用户令牌混入管理端链路_拒绝() {
        String userToken = provider.createAccessToken(UUID.randomUUID());

        Verification v = BearerTokens.verify(provider, requestWith("Bearer " + userToken), true);

        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void 员工令牌走管理端链路_放行() {
        UUID staffId = UUID.randomUUID();

        Verification v =
                BearerTokens.verify(provider, requestWith("Bearer " + provider.createStaffAccessToken(staffId)), true);

        assertThat(v.failed()).isFalse();
        assertThat(v.subjectId()).isEqualTo(staffId);
    }

    @Test
    void 过期令牌_专码TOKEN_EXPIRED() {
        JwtProperties props = new JwtProperties();
        props.setAccessTokenExpiration(-1);
        JwtProvider expiredProvider = new JwtProvider(props);
        String token = expiredProvider.createAccessToken(UUID.randomUUID());

        Verification v = BearerTokens.verify(expiredProvider, requestWith("Bearer " + token), false);

        // 过期与格式无效分码：前端可区分「重新登录」与「刷新令牌」
        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("TOKEN_EXPIRED");
    }
}
