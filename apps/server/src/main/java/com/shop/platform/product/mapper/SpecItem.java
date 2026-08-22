package com.shop.platform.product.mapper;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 销售属性维度 {name, values}，SKU 按各维取值笛卡尔积生成。
 *
 * <p>product.specs 列（JSONB）的元素形状，HTTP 入参与持久化共用。校验注解只在请求边界经 @Valid 触发，DB 读/JSON 出参路径惰性。
 */
public record SpecItem(
        @NotBlank @Size(max = 32) String name, @NotEmpty @Size(max = 20) List<@Size(max = 64) String> values) {}
