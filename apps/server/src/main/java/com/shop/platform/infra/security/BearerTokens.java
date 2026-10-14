package com.shop.platform.infra.security;

import com.shop.platform.common.ErrorCodes;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * Bearer access token 校验链（JwtAuthFilter / StaffAuthFilter / SubaccountAuthFilter 共用）。
 *
 * <p>三条链的差别只在「接受哪些 kind」以及「subject 放进哪个 Holder」，校验顺序、失败文案完全一致，
 * 故收口到这里。kind 是**白名单**语义：不在 {@code accepted} 里的一律「Token 类型错误」——
 * 员工 token 进不了用户链路、子账号 token 进不了买家链路、用户 token 进不了管理端，
 * 每条链只顾自己那一档（少写一档就是把 id 空间混用，subaccountId 会被当成 userId 去查库）。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class BearerTokens {

    private static final String BEARER_PREFIX = "Bearer ";

    /** 校验结果：通过带 subject id 与主体类型；失败带 code（可为 null）与展示文案 */
    public record Verification(UUID subjectId, TokenKind kind, String code, String detail) {

        static Verification pass(UUID subjectId, TokenKind kind) {
            return new Verification(subjectId, kind, null, null);
        }

        static Verification fail(String code, String detail) {
            return new Verification(null, null, code, detail);
        }

        /** true = 未通过，code/detail 可直接转成 401 BusinessException */
        public boolean failed() {
            return subjectId == null;
        }
    }

    /**
     * 完整校验链：取头 → 验签 → type → kind → audience → 过期，任何一步不过即短路返回失败结果。
     *
     * @param accepted 本条链路接受的 kind 白名单
     */
    public static Verification verify(JwtProvider jwtProvider, HttpServletRequest request, Set<TokenKind> accepted) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            // 「没带令牌」与「令牌无效」是同一类**令牌裁决**，给同一个码：客户端那条 401 拦截器按码
            // 决定要不要刷新重放（sdk-client 的 isTokenVerdict），code 为 null 它就只能放弃，
            // 而「请求抢在 bootstrapAuth 之前发出」恰恰是要刷一次才能继续的那种。
            // 这一格此前是 null，与 contracts/error-codes.yaml 里 INVALID_TOKEN 那张卡「未携带 token」对不上。
            return Verification.fail(ErrorCodes.INVALID_TOKEN, "请先登录");
        }

        Claims claims =
                jwtProvider.parse(header.substring(BEARER_PREFIX.length()).trim());
        if (claims == null) {
            return Verification.fail(ErrorCodes.INVALID_TOKEN, "Token 格式无效");
        }
        if (!jwtProvider.isAccessToken(claims)) {
            return Verification.fail(ErrorCodes.INVALID_TOKEN, "Token 类型错误");
        }
        TokenKind kind = jwtProvider.kindOf(claims);
        if (kind == null || !accepted.contains(kind)) {
            return Verification.fail(ErrorCodes.INVALID_TOKEN, "Token 类型错误");
        }
        // VERIFY-01: 校验 audience（手动兜底，配合 JwtProvider 的 requireIssuer）
        if (claims.getAudience() == null || !claims.getAudience().contains(jwtProvider.getExpectedAudience())) {
            return Verification.fail(ErrorCodes.INVALID_TOKEN, "Token 受众无效");
        }
        if (jwtProvider.isExpired(claims)) {
            return Verification.fail(ErrorCodes.TOKEN_EXPIRED, "Token 已过期");
        }
        return Verification.pass(jwtProvider.getUserId(claims), kind);
    }
}
