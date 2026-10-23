package com.shop.platform.common;

/**
 * 地址字段的长度口径：收货人/地名/详址/标签/智能粘贴框各一档。
 *
 * <p>上限与 DB 列宽一一对应（改这里必须同步改迁移列宽）；前端表单的同值镜像在
 * {@code packages/common/src/domain/address.ts}。
 */
public final class AddressFieldRules {

    /** 人名与地名的上限（字）：收货人 / 省 / 市 / 区同一档——展示位就那么宽 */
    public static final int NAME_MAX = 30;

    /** 详细地址上限（字）：不含省市区 */
    public static final int DETAIL_MAX = 120;

    /** 智能粘贴那一框的上限（字）：整段文本（姓名+电话+省市区+详址）一次贴进来 */
    public static final int PARSE_TEXT_MAX = 500;

    /** 地址标签上限（字）：内置枚举码（HOME/WORK/…）或用户自填的短文案 */
    public static final int LABEL_MAX = 20;

    private AddressFieldRules() {}
}
