package com.shop.platform.catalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

/**
 * 改一条属性模板的可编辑元数据。{@code null} = 不改。
 *
 * <p><b>这里没有 {@code value_type} / {@code unit} / {@code options} / {@code is_identity} /
 * {@code is_sales_spec}。</b> 它们改的是身份键和 SKU 维度，不是「运营打错了一个字」——
 * 商品进来之后改这些，存量数据全部对不上。
 *
 * <p>{@code visibleWhen} 传对象 = 改规则；不传 = 不改。要清除规则目前只能重建属性——
 * 属性只增不删，清除入口留到有真实需求再加。
 */
public record UpdateCategoryAttributeRequest(
        @Size(max = 64) String name,
        Boolean required,
        Boolean filterable,
        Boolean multi,
        Boolean allowCustom,
        Integer sort,
        String status,
        @Valid CreateCategoryRequest.VisibleWhenRequest visibleWhen) {}
