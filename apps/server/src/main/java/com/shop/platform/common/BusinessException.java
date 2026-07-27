package com.shop.platform.common;

import java.util.List;
import java.util.Map;
import lombok.Getter;

/** 业务异常，由 GlobalExceptionHandler 自动转为 RFC 9457 ProblemDetail。 */
@Getter
public class BusinessException extends RuntimeException {

    private final int httpStatus;

    /** 只在前端无法仅通过 HTTP status 区分时传 code，见 docs/error-codes.md */
    private final String code;

    private final String detail;

    /**
     * 字段级错误列表，格式：[{ "field": "phone", "message": "手机号错误" }]。 主要用于 service 层手动校验后传参，或配合
     * MethodArgumentNotValidException 使用。
     */
    private final transient List<Map<String, String>> errors;

    // ---- 核心构造器 ----

    public BusinessException(int httpStatus, String code, String detail) {
        this(httpStatus, code, detail, null);
    }

    public BusinessException(int httpStatus, String detail) {
        this(httpStatus, null, detail, null);
    }

    public BusinessException(
            int httpStatus, String code, String detail, List<Map<String, String>> errors) {
        super(detail);
        this.httpStatus = httpStatus;
        this.code = code;
        this.detail = detail;
        this.errors = errors;
    }

    // ---- 常用工厂方法 ----

    public static BusinessException notFound(String detail) {
        return new BusinessException(404, detail);
    }

    public static BusinessException conflict(String code, String detail) {
        return new BusinessException(409, code, detail);
    }

    public static BusinessException unauthorized(String detail) {
        return new BusinessException(401, detail);
    }

    public static BusinessException forbidden(String detail) {
        return new BusinessException(403, detail);
    }

    public static BusinessException badRequest(String detail) {
        return new BusinessException(400, detail);
    }

    /** code 为可选参数，只有需要前端区分时才传 */
    public static BusinessException badRequest(String code, String detail) {
        return new BusinessException(400, code, detail);
    }

    public static BusinessException rateLimited(String detail) {
        return new BusinessException(429, detail);
    }
}
