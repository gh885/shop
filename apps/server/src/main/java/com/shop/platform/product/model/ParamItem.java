package com.shop.platform.product.model;

import com.shop.platform.product.dto.ProductFieldRules;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * {attrId, name, value} 条目，product.params 列（非销售参数）的元素形状，HTTP 入参亦复用此类型。
 *
 * <p>attrId 可空：类目有参数模板时必填并校验属于模板；无模板时维持自由文本（attrId=null）。
 * 校验注解只在请求边界经 @Valid 触发，DB 读/JSON 出参路径惰性。
 */
public record ParamItem(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID attrId,
        @NotBlank @Size(max = ProductFieldRules.PARAM_NAME_MAX) String name,
        @NotBlank @Size(max = ProductFieldRules.PARAM_VALUE_MAX) String value) {}
