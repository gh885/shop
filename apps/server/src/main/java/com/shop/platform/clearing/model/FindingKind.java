package com.shop.platform.clearing.model;

import java.util.Locale;

/**
 * 对账能发现的差异类型。
 *
 * <p>三种差异的严重程度不一样，所以不合并成一个"对账不平"：
 *
 * <ul>
 *   <li>{@link #GROUP_UNBALANCED} —— 最严重。复式记账的根不变量被破坏了，说明有人绕过 {@code Ledger}
 *       直接写了分录。这时候整本账都不能信
 *   <li>{@link #CURRENCY_UNBALANCED} —— 同上，但从币种维度看。前一条成立时它必然也成立，
 *       单独列出来是因为它能一句话回答"差在哪个币种"
 *   <li>{@link #BALANCE_MISMATCH} —— 分录自洽，只是余额缓存被绕过改了。真相没坏，缓存坏了，
 *       重算一遍就能修
 * </ul>
 */
public enum FindingKind {
    GROUP_UNBALANCED,
    CURRENCY_UNBALANCED,
    BALANCE_MISMATCH;

    /** 进 JSON 与事件的名字。库里、日志里、告警文案里都用这一个写法。 */
    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }
}
