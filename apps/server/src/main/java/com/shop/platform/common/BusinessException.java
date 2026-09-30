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
     * 字段级错误列表，格式：[{ "field": "phone", "message": "手机号错误" }]，可选再带
     * "value"（那条规则实际作用到的数据，如命中的违禁词）。 主要用于 service 层手动校验后传参，或配合
     * MethodArgumentNotValidException 使用。
     */
    private final transient List<Map<String, String>> errors;

    // 核心构造器
    public BusinessException(int httpStatus, String code, String detail) {
        this(httpStatus, code, detail, null);
    }

    public BusinessException(int httpStatus, String detail) {
        this(httpStatus, null, detail, null);
    }

    public BusinessException(int httpStatus, String code, String detail, List<Map<String, String>> errors) {
        super(detail);
        this.httpStatus = httpStatus;
        this.code = code;
        this.detail = detail;
        this.errors = errors;
    }

    // 常用工厂方法
    public static BusinessException notFound(String detail) {
        return new BusinessException(404, detail);
    }

    public static BusinessException conflict(String detail) {
        return new BusinessException(409, detail);
    }

    public static BusinessException conflict(String code, String detail) {
        return new BusinessException(409, code, detail);
    }

    public static BusinessException unauthorized(String detail) {
        return new BusinessException(401, detail);
    }

    public static BusinessException unauthorized(String code, String detail) {
        return new BusinessException(401, code, detail);
    }

    public static BusinessException forbidden(String detail) {
        return new BusinessException(403, detail);
    }

    /** 403 + 业务 code（禁用、权限不足那类），见 docs/error-codes.md */
    public static BusinessException forbidden(String code, String detail) {
        return new BusinessException(403, code, detail);
    }

    public static BusinessException badRequest(String detail) {
        return new BusinessException(400, detail);
    }

    /** code 为可选参数，只有需要前端区分时才传 */
    public static BusinessException badRequest(String code, String detail) {
        return new BusinessException(400, code, detail);
    }

    /**
     * 400 + 字段级明细：给用户看的句子之外，还要把「哪个字段、卡在哪条规则上的那个值」作为数据交出去
     * （{@code errors[].field} 用 DTO/表单的机器字段名，不用中文标签）。
     *
     * <p>只有「一句话装不下、前端要按字段定位」的那几个码走这条路（见 docs/error-codes.md 的 COM-01）。
     * 用工厂而不是就地 new，是因为 400 的状态码只有从工厂签名里才认得出来（GEN-62）。
     */
    public static BusinessException badRequest(String code, String detail, List<Map<String, String>> errors) {
        return new BusinessException(400, code, detail, errors);
    }

    public static BusinessException rateLimited(String detail) {
        return new BusinessException(429, detail);
    }

    public static BusinessException rateLimited(String code, String detail) {
        return new BusinessException(429, code, detail);
    }

    public static BusinessException gone(String code, String detail) {
        return new BusinessException(410, code, detail);
    }
}
