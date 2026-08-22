package com.shop.platform.product.dto;

import com.shop.platform.product.mapper.SpecItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 更新销售属性模板，请求体就是规格维度列表。维度数与各维取值数设上限，配合 service 的组合总量校验防滥用 */
public record UpdateSpecsRequest(@NotEmpty @Size(max = 10) List<@Valid SpecItem> specs) {}
