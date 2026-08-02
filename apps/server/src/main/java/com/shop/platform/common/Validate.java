package com.shop.platform.common;

/**
 * 前置条件守卫：把「if (条件不满足) throw BusinessException」压成一行。
 *
 * <p>只在失败路径构造异常，happy path 零开销。所有异常由全局异常处理器统一转 ProblemDetail， 对应关系：notNull → 404；isTrue → 默认
 * 400，可重载指定状态码或业务 code。
 */
import lombok.NoArgsConstructor;

@NoArgsConstructor
public final class Validate {

    /** 条件必须为真，否则 400 业务异常（detail 即给前端的信息） */
    public static void isTrue(boolean condition, String detail) {
        if (!condition) throw BusinessException.badRequest(detail);
    }

    /** 条件必须为真，否则 400 + 业务 code（前端需要区分逻辑时用） */
    public static void isTrue(boolean condition, String code, String detail) {
        if (!condition) throw BusinessException.badRequest(code, detail);
    }

    /** 条件必须为真，否则指定状态码的业务异常（如 409 状态冲突） */
    public static void isTrue(boolean condition, int httpStatus, String detail) {
        if (!condition) throw new BusinessException(httpStatus, detail);
    }

    /** 引用必须存在，否则 404；返回引用本身方便链式使用 */
    public static <T> T notNull(T reference, String detail) {
        if (reference == null) throw BusinessException.notFound(detail);
        return reference;
    }
}
