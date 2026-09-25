package com.shop.platform.product.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 按类目属性模板提交规格选择，请求体就是选择列表。维度数与各维取值数设上限，配合 service 的组合总量校验防滥用 */
public record UpdateSpecsRequest(
        @NotEmpty @Size(max = ProductFieldRules.SPECS_MAX) List<@Valid SpecSelectionRequest> specs) {}
