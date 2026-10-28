package com.shop.platform.catalog.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 叶子类目的配置。<b>只有叶子有这个东西</b>——L1/L2 是纯分组，没有任何配置。
 *
 * <p>这个形状取代了原来 {@code category} 表上那六个列。拆开的理由：
 * {@code identity_keys} 这类列只对能挂商品的类目有意义，平铺在每一行上时，
 * L1/L2 那些值永远是 NULL、永远不被读，而"L1 配了会怎样"变成一个需要写解析器回答的问题。
 * 现在它不存在了——L1 没有配置行。
 *
 * @param qualificationCodes 这个类目要的资质代码（3C、食品经营许可）。判定归 {@code governance}
 * @param autoApprove 免审类目：提交即上架，不等平台审核
 */
public record CategoryConfig(
        UUID categoryId,
        List<String> identityKeys,
        List<String> skuIdentityKinds,
        List<String> matchStrategies,
        String brandPolicy,
        List<String> qualificationCodes,
        boolean autoApprove,
        List<AttributeView> attributes,
        Instant createdAt,
        Instant updatedAt) {

    /**
     * 一条属性模板。
     *
     * @param unit 数字型属性的单位。没有它，1m 和 100cm 是两个值，参数哈希拼出来的同款就是错的
     * @param identity 参与参数哈希。只有 enum / number 能当识别属性
     * @param salesSpec 能不能当 SKU 规格。这是类目定的，不是商家自由发挥——
     *     否则同一个类目里有人用"颜色"有人用"色系"，搜索筛选全废
     */
    @Schema(name = "CategoryAttributeView")
    public record AttributeView(
            UUID id,
            String code,
            String name,
            String valueType,
            String unit,
            List<String> options,
            boolean salesSpec,
            boolean required,
            boolean identity,
            boolean filterable,
            boolean multi,
            String status,
            int sort) {}
}
