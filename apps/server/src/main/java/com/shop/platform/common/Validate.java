package com.shop.platform.common;

/**
 * 业务断言的统一出口：把「条件不成立该回什么」从各调用点收进来，状态码与话术只有一处可改。
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
}
