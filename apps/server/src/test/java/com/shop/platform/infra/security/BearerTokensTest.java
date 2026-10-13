package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.infra.security.BearerTokens.Verification;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Bearer 令牌验证链单测（JwtAuthFilter / StaffAuthFilter / SubaccountAuthFilter 共用的收口逻辑）。
 * 安全属性：kind 白名单——三类主体的令牌只在各自的链路里生效（员工 token 混进用户链路、
 * 用户 token 混进管理端、子账号 token 混进买家链路，全部必须被拒）。
 * 失败短路顺序：无头 → 验签 → type → kind → audience。
 *
 * <p>「未携带 token」与「令牌无效」**给同一个码**（INVALID_TOKEN）：两者都是**令牌裁决**——
 * 换一个新令牌就能继续，客户端那条 401 拦截器据此决定刷新并重放一次。此前无头那一支的 code 是 null，
 * 于是「请求抢在 bootstrapAuth 之前发出」这种正是要刷一次的场景，客户端只能放弃。
 * 分两类的判据与边界见 {@code ErrorCodeVocabularyTest.重放边界_401的两类按文件登记且码位相符}。
 */
class BearerTokensTest {

    private static final Set<TokenKind> USER_LINK = Set.of(TokenKind.USER);
    private static final Set<TokenKind> ADMIN_LINK = Set.of(TokenKind.STAFF);
    private static final Set<TokenKind> SELLER_LINK = Set.of(TokenKind.USER, TokenKind.SUBACCOUNT);

    private final JwtProvider provider = new JwtProvider(new JwtProperties());

    private HttpServletRequest requestWith(String authorization) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (authorization != null) {
            request.addHeader("Authorization", authorization);
        }
        return request;
    }

    @Test
    void 无Authorization头_INVALID_TOKEN且detail为请先登录() {
        Verification v = BearerTokens.verify(provider, requestWith(null), USER_LINK);

        assertThat(v.failed()).isTrue();
        assertThat(v.subjectId()).isNull();
        assertThat(v.code()).isEqualTo("INVALID_TOKEN");
        assertThat(v.detail()).isEqualTo("请先登录");
    }

    @Test
    void 垃圾令牌_INVALID_TOKEN() {
        Verification v = BearerTokens.verify(provider, requestWith("Bearer garbage"), USER_LINK);

        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void 用户令牌走用户链路_放行并带出subject与kind() {
        UUID userId = UUID.randomUUID();

        Verification v =
                BearerTokens.verify(provider, requestWith("Bearer " + provider.createAccessToken(userId)), USER_LINK);

        assertThat(v.failed()).isFalse();
        assertThat(v.subjectId()).isEqualTo(userId);
        assertThat(v.kind()).isEqualTo(TokenKind.USER);
    }

    @Test
    void 员工令牌混入用户链路_拒绝() {
        String staffToken = provider.createStaffAccessToken(UUID.randomUUID());

        Verification v = BearerTokens.verify(provider, requestWith("Bearer " + staffToken), USER_LINK);

        // 安全属性：staff 的 subject 是 account.staff.id，绝不能落进 userIdHolder
        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void 用户令牌混入管理端链路_拒绝() {
        String userToken = provider.createAccessToken(UUID.randomUUID());

        Verification v = BearerTokens.verify(provider, requestWith("Bearer " + userToken), ADMIN_LINK);

        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void 员工令牌走管理端链路_放行() {
        UUID staffId = UUID.randomUUID();

        Verification v = BearerTokens.verify(
                provider, requestWith("Bearer " + provider.createStaffAccessToken(staffId)), ADMIN_LINK);

        assertThat(v.failed()).isFalse();
        assertThat(v.subjectId()).isEqualTo(staffId);
    }

    @Test
    void 子账号令牌混进买家链路_拒绝() {
        String subToken = provider.createSubaccountAccessToken(UUID.randomUUID());

        // 子账号是纯工作身份：它的 subject 是 account.shop_subaccounts.id，买家链路一律不收
        Verification v = BearerTokens.verify(provider, requestWith("Bearer " + subToken), USER_LINK);

        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void 子账号令牌走卖家链路_放行且kind可辨() {
        UUID subaccountId = UUID.randomUUID();

        Verification v = BearerTokens.verify(
                provider, requestWith("Bearer " + provider.createSubaccountAccessToken(subaccountId)), SELLER_LINK);

        assertThat(v.failed()).isFalse();
        assertThat(v.subjectId()).isEqualTo(subaccountId);
        assertThat(v.kind()).isEqualTo(TokenKind.SUBACCOUNT);
    }

    @Test
    void 店主令牌走卖家链路_仍按用户身份放行() {
        UUID userId = UUID.randomUUID();

        Verification v =
                BearerTokens.verify(provider, requestWith("Bearer " + provider.createAccessToken(userId)), SELLER_LINK);

        assertThat(v.failed()).isFalse();
        assertThat(v.kind()).isEqualTo(TokenKind.USER);
    }

    @Test
    void 用户令牌混进管理端之外的员工链路判定_拒绝() {
        // 反向：子账号链路不接受员工令牌（员工只在 /admin 生效）
        String staffToken = provider.createStaffAccessToken(UUID.randomUUID());

        Verification v = BearerTokens.verify(provider, requestWith("Bearer " + staffToken), SELLER_LINK);

        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void 过期令牌_专码TOKEN_EXPIRED() {
        JwtProperties props = new JwtProperties();
        props.setAccessTokenExpiration(-1);
        JwtProvider expiredProvider = new JwtProvider(props);
        String token = expiredProvider.createAccessToken(UUID.randomUUID());

        Verification v = BearerTokens.verify(expiredProvider, requestWith("Bearer " + token), USER_LINK);

        // 过期与格式无效分码：前端可区分「重新登录」与「刷新令牌」
        assertThat(v.failed()).isTrue();
        assertThat(v.code()).isEqualTo("TOKEN_EXPIRED");
    }
}
