package com.shop.platform.product.dto;

import com.shop.platform.product.mapper.SpecItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/** 更新销售属性模板，请求体就是规格维度列表 */
public record UpdateSpecsRequest(@NotEmpty List<@Valid SpecItem> specs) {}
