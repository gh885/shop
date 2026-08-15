package com.shop.platform.product.dto;

import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.service.ProductService.UpdateBasicCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 编辑商品基本信息：与创建同字段，去掉 shopId（店铺归属创建后不可改） */
public record UpdateProductRequest(
        /** 主分类 ID */
        @NotNull UUID categoryId,
        @NotBlank @Size(max = 128) String name,
        @Size(max = 255) String subtitle,
        String description,
        @Size(max = 255) String mainImage,
        List<@Size(max = 255) String> images,
        List<@Valid ParamItem> params) {
    public UpdateProductRequest {
        if (name != null) name = name.trim();
        if (subtitle != null) subtitle = subtitle.trim();
    }

    /** 映射为 service 入参 */
    public UpdateBasicCommand toCommand() {
        return new UpdateBasicCommand(categoryId, name, subtitle, description, mainImage, images, params);
    }
}
