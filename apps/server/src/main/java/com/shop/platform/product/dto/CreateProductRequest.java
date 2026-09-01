package com.shop.platform.product.dto;

import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 创建商品草稿：只存基本信息，specs/SKU 由后续接口单独处理。店铺归属从 X-Shop-Id 上下文注入 */
public record CreateProductRequest(
        /** 主分类 ID */
        @NotNull UUID categoryId,
        /** 搜索标题：参与搜索召回的关键词位，写长了在卡片里也是被截断，上限 30 字 */
        @NotBlank @Size(max = 30, message = "商品标题最长 30 字") String name,
        /**
         * 一句话卖点：可不填；填了就得写够一句（10~30 字）。空串＝清空（PATCH 语义下要与「不传」区分），
         * 故用 Pattern 而非 Size —— Size(min) 会把空串一起判死。
         */
        @Pattern(regexp = "^$|^[\\s\\S]{10,30}$", message = "卖点填了就写 10~30 字，不想写可以留空") String subtitle,
        /** 详情富文本，TEXT 无长度上限，且请求体有 RequestBodySizeFilter 兜底 */
        String description,
        @Size(max = 255) String mainImage,
        List<@Size(max = 255) String> images,
        /** 非销售参数，可空：[] */
        List<@Valid ParamItem> params) {
    public CreateProductRequest {
        if (name != null) name = name.trim();
        if (subtitle != null) subtitle = subtitle.trim();
    }

    /** 映射为 service 入参，shopId 由店铺上下文（X-Shop-Id + 成员校验）注入 */
    public CreateProductCommand toCommand(UUID shopId) {
        return new CreateProductCommand(shopId, categoryId, name, subtitle, description, mainImage, images, params);
    }
}
