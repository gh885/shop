package com.shop.platform.product.dto;

import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.service.ProductService.UpdateBasicCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 编辑商品基本信息：与创建同字段，去掉 shopId（店铺归属创建后不可改） */
public record UpdateProductRequest(
        /** 主分类 ID */
        @NotNull UUID categoryId,
        /** 搜索标题，上限 30 字，语义同 CreateProductRequest */
        @NotBlank @Size(max = 30, message = "商品标题最长 30 字") String name,
        /** 一句话卖点：空串＝清空已填内容，不传（null）＝不改（PATCH 语义） */
        @Pattern(regexp = "^$|^[\\s\\S]{10,30}$", message = "卖点填了就写 10~30 字，不想写可以留空") String subtitle,
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
