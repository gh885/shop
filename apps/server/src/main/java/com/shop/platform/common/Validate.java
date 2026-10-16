package com.shop.platform.common;

import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;
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

    /** 条件必须为真，否则 400；detail 惰性求值，只在失败时构造，供 message 含可空字段的场景 */
    public static void isTrue(boolean condition, Supplier<String> detail) {
        if (!condition) throw BusinessException.badRequest(detail.get());
    }

    /** 条件必须为真，否则 409 状态冲突 */
    public static void conflict(boolean condition, String detail) {
        if (!condition) throw BusinessException.conflict(detail);
    }

    /**
     * 归属闸门（判定式已在手边时用）：不是你的资源一律「不存在」。
     *
     * <p>为什么只能是 404：403/400 会把「这行存在，只是不归你」说出来，脚本拿状态码差就能枚举别人名下的 id。
     * 各域规则条目写的是同一条口径（PRD-25 / ORD-01 / CART-05 / CPN-10 / AFS-06 / ACC-47 / ACC-79…），
     * 但此前每处各写一遍、各挑一个状态码——于是「越权说什么」有了十几种说法。收成一个方法，
     * 状态码与「缺席用同一句话」这件事从此只有一处可改。
     *
     * <p>反面口径（越权给 403）只属于<b>上下文与角色</b>：缺 X-Shop-Id、不是本店成员、权限码不够、
     * 账号被禁用——那些不是「某个资源归谁」，仍走 {@link BusinessException#forbidden}。
     */
    private static void owned(boolean belongs, String absentDetail) {
        if (!belongs) throw BusinessException.notFound(absentDetail);
    }

    /**
     * 取行 + 归属闸门一句完成：行缺席（null）与 owner 列不是调用方主体，回答同一句 {@code absentDetail}（404）。
     *
     * <p>返回该行方便继续用。owner 列用方法引用给出（{@code Order::getUserId}），等值判断与状态码都不在调用点，
     * 所以调用点想写错也没有可写的地方。
     */
    public static <T, I> T requireOwned(T row, Function<T, I> ownerField, I callerId, String absentDetail) {
        T present = notNull(row, absentDetail);
        owned(Objects.equals(ownerField.apply(present), callerId), absentDetail);
        return present;
    }

    /** {@link #requireOwned(Object, Function, Object, String)} 的 Optional 形状：跨模块 api 点查走这一条 */
    public static <T, I> T presentOwned(Optional<T> row, Function<T, I> ownerField, I callerId, String absentDetail) {
        return requireOwned(row.orElse(null), ownerField, callerId, absentDetail);
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

    /** 存在性条件：false 按资源不存在处理（404），用于把业务谓词与缺席话术收在一处 */
    public static void present(boolean present, String absentDetail) {
        if (!present) throw BusinessException.notFound(absentDetail);
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
