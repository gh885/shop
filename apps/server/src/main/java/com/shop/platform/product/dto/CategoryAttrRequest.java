package com.shop.platform.product.dto;

import com.shop.platform.product.model.AttrKind;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 类目属性模板条目入参，create/update 共用（字段完全相同）。kind 只在创建时生效，更新忽略
 * （销售属性改参数会让存量 SKU 失去出处）。
 */
public record CategoryAttrRequest(
        @NotBlank @Size(max = CategoryFieldRules.ATTR_NAME_MAX) String name,
        /** 销售属性 / 非销售参数 */
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED) AttrKind kind,
        /** param 是否必填（对 spec 无意义），缺省 false */
        Boolean required,
        /** 卖家可否扩充值域/自由输入，缺省 true */
        Boolean allowCustom,
        /** 该规格是否允许每个取值上传配图 */
        Boolean allowImage,
        Integer sort) {
    public CategoryAttrRequest {
        if (name != null) name = name.trim();
    }
}
