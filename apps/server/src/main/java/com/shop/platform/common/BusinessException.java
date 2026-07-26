package com.shop.platform.common;

import lombok.Getter;

/**
 * 业务异常，由 GlobalExceptionHandler 自动转为 RFC 9457 ProblemDetail。
 */
@Getter
public class BusinessException extends RuntimeException {

    private final int httpStatus;
    private final String code;
    private final String detail;

    public BusinessException(int httpStatus, String code, String detail) {
        super(detail);
        this.httpStatus = httpStatus;
        this.code = code;
        this.detail = detail;
    }

    // 常用工厂方法

    public static BusinessException notFound(String detail) {
        return new BusinessException(404, ErrorCodes.RESOURCE_NOT_FOUND, detail);
    }

    public static BusinessException conflict(String code, String detail) {
        return new BusinessException(409, code, detail);
    }

    public static BusinessException unauthorized(String detail) {
        return new BusinessException(401, ErrorCodes.AUTH_UNAUTHORIZED, detail);
    }

    public static BusinessException forbidden(String detail) {
        return new BusinessException(403, ErrorCodes.AUTH_FORBIDDEN, detail);
    }

    public static BusinessException rateLimited(String detail) {
        return new BusinessException(429, ErrorCodes.RATE_LIMIT_EXCEEDED, detail);
    }
}
