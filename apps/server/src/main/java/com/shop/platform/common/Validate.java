package com.shop.platform.common;

import java.util.Optional;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@NoArgsConstructor(access = AccessLevel.PRIVATE)
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

    /**
     * 必填文本：空白（含 null）即 400；返回 trim 后的净值。
     * 用于值对象构造期自校验——DB 里已是净值，这里幂等兜底，保证按值比较稳定。
     */
    public static String requireText(String value, String label) {
        isTrue(value != null && !value.isBlank(), label + "不能为空");
        return value.trim();
    }

    /**
     * 列表接口的枚举筛选值：空白（含 null）= 不过滤，非法值 400。
     *
     * <p>枚举自己就是合法值表，不另维护一份。各处曾各写一份 try/{@code valueOf}/catch——少抄 catch 的那一份
     * 会把 {@code ?status=bogus} 抛成 IllegalArgumentException，而 {@code GlobalExceptionHandler} 不认它，
     * 于是同一个筛选参数在一堆接口里 400、在另一堆里 500。
     */
    public static <E extends Enum<E>> E enumFilter(Class<E> type, String raw, String detail) {
        String value = Text.blankToNull(raw);
        if (value == null) return null;
        try {
            return Enum.valueOf(type, value);
        } catch (IllegalArgumentException e) {
            throw BusinessException.badRequest(detail);
        }
    }

    /** 引用必须存在，否则 404；返回引用本身方便链式使用 */
    public static <T> T notNull(T reference, String detail) {
        if (reference == null) throw BusinessException.notFound(detail);
        return reference;
    }

    /** Optional 必须有值（api 包单点查的标准收口），否则 404；返回值方便链式使用 */
    public static <T> T present(Optional<T> optional, String detail) {
        return optional.orElseThrow(() -> BusinessException.notFound(detail));
    }

    /** Optional 必须有值，否则指定状态码的业务异常（缺席不等于不存在时用，如 400 参数不可满足） */
    public static <T> T present(Optional<T> optional, int httpStatus, String detail) {
        return optional.orElseThrow(() -> new BusinessException(httpStatus, detail));
    }
}
