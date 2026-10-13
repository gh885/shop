package com.shop.platform.infra.security;

import io.jsonwebtoken.Claims;

/**
 * access token 的主体类型（JWT {@code kind} claim）。三类主体各有自己的 token 空间与生效范围：
 *
 * <ul>
 *   <li>{@link #USER} —— 买家/店主（account.users），除 {@code /admin/**} 外的全部链路；
 *   <li>{@link #STAFF} —— 平台员工（account.staff），只在 {@code /admin/**} 生效（StaffAuthFilter）；
 *   <li>{@link #SUBACCOUNT} —— 卖家子账号（account.shop_subaccounts），只在 {@code /seller/**} 生效
 *       （SubaccountAuthFilter）。它是纯工作身份：拿子账号 token 打买家侧接口一律 401。
 * </ul>
 *
 * <p>取值刻意写 {@code subaccount} 而不是 {@code sub}：JWT 的 {@code sub} claim 已经是「主体 id」，
 * 再让 {@code kind=sub} 与它同现一个 token，读日志的人分不清哪个是类型哪个是 id。
 */
public enum TokenKind {
    USER("user"),
    STAFF("staff"),
    SUBACCOUNT("subaccount");

    private final String claimValue;

    TokenKind(String claimValue) {
        this.claimValue = claimValue;
    }

    /** 落进 JWT {@code kind} claim 的字面量 */
    public String claimValue() {
        return claimValue;
    }

    /** 从 claims 读主体类型；缺失或不在词表内返回 null（调用方按「类型错误」拒绝） */
    public static TokenKind of(Claims claims) {
        Object raw = claims.get("kind");
        if (raw == null) {
            return null;
        }
        for (TokenKind kind : values()) {
            if (kind.claimValue.equals(raw.toString())) {
                return kind;
            }
        }
        return null;
    }
}
