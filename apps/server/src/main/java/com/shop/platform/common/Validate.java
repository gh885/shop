package com.shop.platform.common;

import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;

/**
 * 业务断言的统一出口：把「条件不成立该回什么」从各调用点收进来，状态码与话术只有一处可改。
 *
 * <p>归属闸门只给 404：403/400 会把「这行存在，只是不归你」说出来，脚本拿状态码差就能枚举别人名下的 id。
 */
public final class Validate {

    private Validate() {}

    /** 条件必须为真，否则 400 业务异常（detail 即给前端的信息） */
    public static void isTrue(boolean condition, String detail) {
        if (!condition) throw BusinessException.badRequest(detail);
    }

    /** 条件必须为真，否则 400 + 业务 code（前端需要区分逻辑时用） */
    public static void isTrue(boolean condition, String code, String detail) {
        if (!condition) throw BusinessException.badRequest(code, detail);
    }

    /** 取行 + 归属闸门一句完成：行缺席（null）与 owner 列不是调用方主体，回答同一句 detail（404） */
    public static <T, I> T requireOwned(T row, Function<T, I> ownerField, I callerId, String absentDetail) {
        if (row == null || !Objects.equals(ownerField.apply(row), callerId)) {
            throw BusinessException.notFound(absentDetail);
        }
        return row;
    }

    /** {@link #requireOwned} 的 Optional 形状：跨模块 api 点查走这一条 */
    public static <T, I> T presentOwned(Optional<T> row, Function<T, I> ownerField, I callerId, String absentDetail) {
        return requireOwned(row.orElse(null), ownerField, callerId, absentDetail);
    }
}
