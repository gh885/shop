package com.shop.platform.infra.security;

import com.shop.platform.common.ErrorCodes;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * Bearer access token 校验链（JwtAuthFilter / StaffAuthFilter 共用）。
 *
 * <p>用户链路与管理端链路的差别只在「拒绝还是要求员工 token」以及「subject 放进哪个 Holder」，校验顺序、失败文案完全一致，
 * 故收口到这里。kind 校验规则：requireStaff=true 只收 kind=staff（管理端）；false 拒绝 staff（用户链路，
 * 防止 staff UUID 被当成 userId——员工 token 只能在 /admin/** 使用）。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class BearerTokens {

    private static final String BEARER_PREFIX = "Bearer ";

    /** 校验结果：通过带 subject id（userId / staffId）；失败带 code（可为 null）与展示文案 */
    public record Verification(UUID subjectId, String code, String detail) {

        static Verification pass(UUID subjectId) {
            return new Verification(subjectId, null, null);
        }

        static Verification fail(String code, String detail) {
            return new Verification(null, code, detail);
        }

        /** true = 未通过，code/detail 可直接转成 401 BusinessException */
        public boolean failed() {
            return subjectId == null;
        }
    }

    /** 完整校验链：取头 → 验签 → type → kind → audience → 过期，任何一步不过即短路返回失败结果 */
    public static Verification verify(JwtProvider jwtProvider, HttpServletRequest request, boolean requireStaff) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            // 「没带令牌」与「令牌无效」是同一类**令牌裁决**，给同一个码：客户端那条 401 拦截器按码
            // 决定要不要刷新重放（sdk-client 的 isTokenVerdict），code 为 null 它就只能放弃，
            // 而「请求抢在 bootstrapAuth 之前发出」恰恰是要刷一次才能继续的那种。
            // 这一格此前是 null，与 openapi/error-codes.mjs 里 INVALID_TOKEN 那张卡「未携带 token」对不上。
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
        if (jwtProvider.isStaff(claims) != requireStaff) {
            return Verification.fail(ErrorCodes.INVALID_TOKEN, "Token 类型错误");
        }
        // VERIFY-01: 校验 audience（手动兜底，配合 JwtProvider 的 requireIssuer）
        if (claims.getAudience() == null || !claims.getAudience().contains(jwtProvider.getExpectedAudience())) {
            return Verification.fail(ErrorCodes.INVALID_TOKEN, "Token 受众无效");
        }
        if (jwtProvider.isExpired(claims)) {
            return Verification.fail(ErrorCodes.TOKEN_EXPIRED, "Token 已过期");
        }
        return Verification.pass(jwtProvider.getUserId(claims));
    }
}
