package com.shop.platform.account.api;

import com.shop.platform.account.dto.AccountFieldRules;

/**
 * 子账号入参的字段规则。放在 {@code api} 包（而不是 {@code account.dto}）是刻意的：
 * 建号 / 重置口令这两个入参注解住在<b>店铺侧</b>的 DTO 上（{@code /shops/{shopId}/subaccounts}，
 * 店主操作），而 {@code account.dto} 不是对外命名接口，店铺模块看不见它。
 *
 * <p>口令档不另立数字，直接复用买家/员工那一份（{@link AccountFieldRules#PASSWORD_MIN} /
 * {@link AccountFieldRules#PASSWORD_MAX}）：同一个输入在三条路径上给出三种下限，正是「改了登录忘了改建号」
 * 会静默发生的地方。这里只是把那份常量的名字暴露到跨模块可引用的位置，值仍只有一处。
 */
public final class SubaccountFieldRules {

    /** 登录名下限（字）：太短的登录名在同名空间里撞车概率高，也给不出可读的工作身份 */
    public static final int LOGIN_NAME_MIN = 4;

    /** 登录名上限（字）：{@code account.shop_subaccounts.login_name VARCHAR(50)} */
    public static final int LOGIN_NAME_MAX = 50;

    /**
     * 登录名形状（字母、数字、下划线、短横）：登录账号不许有空格与中文——粘错一个空格就是
     * 「登录名明明对却登不上」（与员工工号同一取舍）。
     */
    public static final String LOGIN_NAME_PATTERN = "^[A-Za-z0-9_-]+$";

    /** 登录名形状的报错文案（与 {@link #LOGIN_NAME_PATTERN} 同一处事实，改形状即改这句） */
    public static final String LOGIN_NAME_PATTERN_MESSAGE = "登录名只能包含字母、数字、下划线或短横";

    /** 口令下限（字），与买家/员工同一个数 */
    public static final int PASSWORD_MIN = AccountFieldRules.PASSWORD_MIN;

    /** 口令上限（字符数），与买家/员工同一个数（BCrypt 的字节档由 PasswordPolicy 另判） */
    public static final int PASSWORD_MAX = AccountFieldRules.PASSWORD_MAX;

    private SubaccountFieldRules() {}
}
