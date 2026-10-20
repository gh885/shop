package com.shop.platform.product.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * 平台标准品的建/改入参（管理端）。创建与编辑共用一份：同名字段同一套规则，分两份只会漂移。
 *
 * <p>没有 status / mergedInto：合并是一个独立动作（有去向、要改挂靠），不该混在「改个名字」里。
 */
public record StandardProductRequest(
        /** 归属类目：标准品必须挂在类目下，聚合与检索都以类目为第一维 */
        @NotNull UUID categoryId,
        /** 标准名（如「iPhone 15 Pro 256G 黑色」），平台维护，不是任何商家标题的副本 */
        @NotNull @Size(min = 1, max = ProductFieldRules.STANDARD_NAME_MAX) String name,
        /** 品牌，可空（长尾白牌没有品牌） */
        @Size(max = ProductFieldRules.STANDARD_BRAND_MAX) String brand,
        /** 条码（EAN/UPC），可空；有它就是跨店识别最硬的依据，同一可用标准品内不可重复 */
        @Size(max = ProductFieldRules.STANDARD_BARCODE_MAX) String barcode) {

    public StandardProductRequest {
        if (name != null) name = name.trim();
        // 空白品牌/条码按「没填」存，不落空串——空串会让「有没有条码」变成两个答案
        if (brand != null) brand = brand.trim().isEmpty() ? null : brand.trim();
        if (barcode != null) barcode = barcode.trim().isEmpty() ? null : barcode.trim();
    }
}
