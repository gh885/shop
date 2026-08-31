package com.shop.platform.product.mapper;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * {attrId, name, value} 条目，product.params 列（非销售参数）的元素形状，HTTP 入参亦复用此类型。
 *
 * <p>attrId 可空：类目有参数模板时必填并校验属于模板（见 ProductService 校验）；无模板时维持自由文本（attrId=null）。
 * 校验注解只在请求边界经 @Valid 触发，DB 读/JSON 出参路径惰性。
 */
public record ParamItem(UUID attrId, @NotBlank @Size(max = 32) String name, @NotBlank @Size(max = 64) String value) {}
