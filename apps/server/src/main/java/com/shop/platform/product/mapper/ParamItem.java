package com.shop.platform.product.mapper;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {name, value} 条目，product.params 列（非销售参数）与 skus.attributes 列（规格取值）共用同一形状，HTTP 入参亦复用此类型。
 *
 * <p>校验注解只在请求边界经 @Valid 触发，DB 读/JSON 出参路径惰性。
 */
public record ParamItem(@NotBlank @Size(max = 32) String name, @NotBlank @Size(max = 64) String value) {}
