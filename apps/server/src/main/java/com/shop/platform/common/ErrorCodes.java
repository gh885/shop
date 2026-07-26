package com.shop.platform.common;

/**
 * 业务错误码常量，遵循 {@code domain.subkey} 蛇形命名。
 *
 * @see <a href="https://www.rfc-editor.org/rfc/rfc9457">RFC 9457 Problem Details</a>
 */
public final class ErrorCodes {

    private ErrorCodes() {}

    // 通用
    public static final String VALIDATION_ERROR = "validation.error";
    public static final String RESOURCE_NOT_FOUND = "resource.not_found";
    public static final String RESOURCE_CONFLICT = "resource.conflict";
    public static final String INTERNAL_ERROR = "internal.error";
    public static final String RATE_LIMIT_EXCEEDED = "rate_limit.exceeded";

    // Auth
    public static final String AUTH_UNAUTHORIZED = "auth.unauthorized";
    public static final String AUTH_INVALID_TOKEN = "auth.invalid_token";
    public static final String AUTH_TOKEN_EXPIRED = "auth.token_expired";
    public static final String AUTH_FORBIDDEN = "auth.forbidden";
    public static final String AUTH_INVALID_CREDENTIALS = "auth.invalid_credentials";
    public static final String AUTH_EMAIL_TAKEN = "auth.email_taken";
    public static final String USER_NOT_FOUND = "user.not_found";
    public static final String USER_DISABLED = "user.disabled";

    // SMS
    public static final String SMS_CODE_EXPIRED = "sms.code_expired";
    public static final String SMS_CODE_INVALID = "sms.code_invalid";
    public static final String SMS_RATE_LIMIT = "sms.rate_limit";
    public static final String SMS_DAILY_LIMIT = "sms.daily_limit";
}
