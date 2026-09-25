package com.shop.platform.product.dto;

import com.shop.platform.product.model.ParamItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 编辑商品基本信息：与创建同字段，去掉 shopId（店铺归属创建后不可改）。PATCH 语义：null＝不改。 */
public record UpdateProductRequest(
        /** 主分类 ID。PATCH：null＝不改类目；非 null 且与当前不同时仅草稿可改（上架/仓库中改类目被拒）。 */
        UUID categoryId,
        /** 搜索标题，上限与创建同一份规则；草稿阶段允许空（发布/重上由 ensurePublishable 统校验），空串＝清空 */
        @Size(max = ProductFieldRules.NAME_MAX, message = ProductFieldRules.NAME_MESSAGE) String name,
        /** 一句话卖点：空串＝清空已填内容，不传（null）＝不改（PATCH 语义）；长度规则与创建同一份 */
        @Pattern(regexp = ProductFieldRules.SELL_POINT_PATTERN, message = ProductFieldRules.SELL_POINT_MESSAGE)
                String subtitle,
        /** 详情图流（对象存储 key 数组）；空串/空数组语义见 PATCH。null＝不改 */
        List<@Size(max = ProductFieldRules.IMAGE_KEY_MAX) String> detailImages,
        @Size(max = ProductFieldRules.IMAGE_KEY_MAX) String mainImage,
        List<@Size(max = ProductFieldRules.IMAGE_KEY_MAX) String> images,
        List<@Valid ParamItem> params,
        /** 七天无理由退货声明。PATCH：null＝不改（不传与传 false 必须分得开，故用包装类型） */
        Boolean sevenDayReturn) {
    public UpdateProductRequest {
        if (name != null) name = name.trim();
        if (subtitle != null) subtitle = subtitle.trim();
    }
}
