package com.shop.platform.account.api;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 卖家子账号状态。放在 {@code api} 包而不是 {@code model}：它是唯一一份词表，同时给两处消费——
 * 账号侧的登录/激活闸门，与店铺侧的子账号管理页（出参直接带这个枚举，不再折成布尔再让前端猜）。
 *
 * <p>三档的语义：
 * <ul>
 *   <li>{@code PENDING_ACTIVATION} —— 店主已建号，员工还没用本人手机号验过号；此档不可登录，也不能被客服绕过；
 *   <li>{@code ACTIVE} —— 已激活，可登录卖家工作台；
 *   <li>{@code DISABLED} —— 停用（保留凭证、立即失效、可解冻）。与「移除」不同：移除是删行，
 *       子账号凭证就此不存在，登录名与手机号占位一并释放。
 * </ul>
 *
 * <p>DB 存 {@code name()}（varchar）。
 */
@Schema(enumAsRef = true)
public enum SubaccountStatus {

    /** 待激活：可登录名占用、不可使用 */
    PENDING_ACTIVATION,

    /** 已激活：可登录卖家工作台 */
    ACTIVE,

    /** 已停用：凭证保留但立即失效（判权每请求查库） */
    DISABLED;

    public boolean isActive() {
        return this == ACTIVE;
    }
}
