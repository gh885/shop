package com.shop.platform.infra.security;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 一对签发的令牌：access token + refresh token。供 auth / admin 模块共用。
 *
 * <p>refreshToken 刻意不序列化进响应体（{@code @JsonIgnore}）：它只经 path 限定的 httpOnly cookie 下发，
 * 若在 body 里明文返回，XSS 可在登录/刷新瞬间读走本该 JS 接触不到的凭证，cookie 防护形同自拆。
 * 未来非 Web 客户端确有需要时另立契约，当前无此场景。
 */
public record TokenPair(@Schema(requiredMode = REQUIRED) String accessToken, @JsonIgnore String refreshToken) {}
