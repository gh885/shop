package com.shop.platform.audit.dto;

/** 审计入参的数字词表：注解只引用这里的常量（GEN-61：数字字面量不许出现在注解里）。 */
public final class AuditFieldRules {

    /** 目标 ID 文本长度上限：列宽 64 */
    public static final int TARGET_ID_MAX = 64;

    /** 动作筛选值长度上限：action 列宽 64 */
    public static final int ACTION_MAX = 64;

    /** detail 说明长度上限：列宽 200，与落库同宽（DB 是第二道闸但方向上不该更松） */
    public static final int DETAIL_MAX = 200;

    /** 目标类型筛选值长度上限：枚举名最长 13（SHIPMENT_ISSUE），留到 32 覆盖将来新增 */
    public static final int TARGET_TYPE_MAX = 32;

    private AuditFieldRules() {}
}
