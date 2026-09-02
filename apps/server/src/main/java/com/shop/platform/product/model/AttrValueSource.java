package com.shop.platform.product.model;

/**
 * 类目属性值来源：平台预置 vs 卖家扩充（提交值域外新值时自动建档）。
 *
 * <p>DB 存 {@code name()}（varchar）。
 */
public enum AttrValueSource {

    /** 平台预置 */
    PLATFORM,

    /** 卖家扩充 */
    SELLER;
}
