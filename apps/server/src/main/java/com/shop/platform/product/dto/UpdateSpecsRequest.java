package com.shop.platform.product.dto;

import com.shop.platform.product.service.SkuService.SpecSelection;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 按类目属性模板提交规格选择，请求体就是选择列表。维度数与各维取值数设上限，配合 service 的组合总量校验防滥用 */
public record UpdateSpecsRequest(@NotEmpty @Size(max = 10) List<@Valid SpecSelectionRequest> specs) {

    /** 映射为 service 入参列表 */
    public List<SpecSelection> toSelections() {
        return specs.stream().map(SpecSelectionRequest::toSelection).toList();
    }
}
