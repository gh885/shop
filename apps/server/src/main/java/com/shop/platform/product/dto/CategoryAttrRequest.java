package com.shop.platform.product.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 类目属性模板条目入参，create/update 共用（字段完全相同）。kind 只在创建时生效，更新忽略
 * （销售属性改参数会让存量 SKU 失去出处，见 CategoryAttrService.updateAttr）。
 */
public record CategoryAttrRequest(
        @NotBlank @Size(max = 32) String name,
        /** 1 销售属性 / 2 非销售参数 */
        @NotNull @Min(1) @Max(2) Integer kind,
        /** param 是否必填（对 spec 无意义），缺省 false */
        Boolean required,
        /** 卖家可否扩充值域/自由输入，缺省 true */
        Boolean allowCustom,
        Integer sort) {
    public CategoryAttrRequest {
        if (name != null) name = name.trim();
    }
}
