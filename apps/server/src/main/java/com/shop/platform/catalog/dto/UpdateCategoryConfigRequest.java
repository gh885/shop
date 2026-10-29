package com.shop.platform.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/**
 * 改叶子类目的配置（属性模板之外的六项）。
 *
 * <p>属性模板不在这里：它只能增、不能删，下线走 {@code status = disabled}，
 * 是另一条入口。把两件事合成一个 PUT，等于让一次保存既能改识别键又能删属性，
 * 而它们对存量商品的影响完全不同。
 *
 * <p><b>识别键与匹配策略在类目有商品之后锁死。</b> 改它们会让存量商品的
 * {@code match_key} / {@code sku.identity_key} 全部失效，而没有任何迁移能猜出
 * 「按新策略这个商品该挂到哪个标准品」。要换策略就在商品进来之前定好。
 */
public record UpdateCategoryConfigRequest(
        @NotEmpty List<String> identityKeys,
        @NotEmpty List<String> skuIdentityKinds,
        List<String> matchStrategies,
        @NotBlank String brandPolicy,
        List<String> qualificationCodes,
        Boolean autoApprove) {

    public boolean autoApproveOrDefault() {
        return Boolean.TRUE.equals(autoApprove);
    }
}
