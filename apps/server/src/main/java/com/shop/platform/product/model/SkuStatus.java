package com.shop.platform.product.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * SKU 在售状态：在售 / 停用。注意与缺货区分——缺货可补可恢复，停用是「这个卖法不卖了」。
 *
 * <p>DB 存 {@code name()}（varchar），不存 ordinal。SPU 与 SKU 状态正交（一上架 SPU 可含停用 SKU）。
 */
@Schema(enumAsRef = true)
public enum SkuStatus {

    /** 停用（不再售卖） */
    DISABLED,

    /** 在售（可加购/下单；缺货是可售罄态，不属本枚举）。
     *  商品级约束（不在此枚举表达）：上架/发布要求至少一个在售 SKU 有货；
     *  上架商品不允许被存成全部售罄。 */
    ON_SALE;

    public boolean onSale() {
        return this == ON_SALE;
    }
}
