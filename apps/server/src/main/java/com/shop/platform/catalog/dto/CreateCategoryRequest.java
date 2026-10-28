package com.shop.platform.catalog.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 建类目的入参。
 *
 * <p><b>L1/L2 是纯分组，只收 code / name / sort；配置只有 L3 叶子才收。</b>
 * 这是这次改动最外显的一条：原来 L1 也必须当场给识别键和属性模板，而它永远挂不了商品——
 * 那些值填了也没人读。
 *
 * <p>所以 {@code config} 为 null 时建分组类目，非 null 时建叶子类目。服务端按
 * 「父类目层级 + 1」算 level，再校验「叶子必须有 config、分组必须没有 config」——
 * 让调用方传 level 就是让它能建出"第 2 层但有配置"这种不可能的行。
 */
public record CreateCategoryRequest(
        UUID parentId,
        @NotBlank @Size(max = 64) String code,
        @NotBlank @Size(max = 64) String name,
        Integer sort,
        @Valid CategoryConfigRequest config) {

    public int sortOrDefault() {
        return sort == null ? 0 : sort;
    }

    /**
     * 叶子类目的配置。只有 L3 才有这个东西。
     *
     * @param identityKeys 必填。认不出商品就用 {@code ["none"]}，不能留空
     * @param attributes 必填。这个格子里的商品要填哪些属性
     */
    public record CategoryConfigRequest(
            @jakarta.validation.constraints.NotEmpty List<String> identityKeys,
            @jakarta.validation.constraints.NotEmpty List<String> skuIdentityKinds,
            List<String> matchStrategies,
            @NotBlank String brandPolicy,
            List<String> qualificationCodes,
            Boolean autoApprove,
            @jakarta.validation.constraints.NotEmpty @Valid List<AttributeRequest> attributes) {

        public boolean autoApproveOrDefault() {
            return Boolean.TRUE.equals(autoApprove);
        }
    }

    /**
     * 一条属性模板。
     *
     * <p><b>布尔和数字用包装类型，不用原始类型。</b> 用 {@code boolean} 的话，请求里缺这个字段
     * Jackson 会抛「Cannot map null into type boolean」而不是取 false——而这几个字段本来就是
     * "不传等于关"的语义，前端少传一个是常态。用一个原始类型换一个 400，是给调用方下绊子。
     *
     * @param unit 数字型必填——没有单位，1m 和 100cm 是两个值
     * @param options 枚举型必填——没有值域，枚举等于自由文本
     */
    @Schema(name = "CreateCategoryAttributeRequest")
    public record AttributeRequest(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 64) String name,
            @NotBlank String valueType,
            @Size(max = 16) String unit,
            List<String> options,
            Boolean salesSpec,
            Boolean required,
            Boolean identity,
            Boolean filterable,
            Boolean multi,
            Integer sort) {

        public boolean salesSpecOrDefault() {
            return Boolean.TRUE.equals(salesSpec);
        }

        public boolean requiredOrDefault() {
            return Boolean.TRUE.equals(required);
        }

        public boolean identityOrDefault() {
            return Boolean.TRUE.equals(identity);
        }

        public boolean filterableOrDefault() {
            return Boolean.TRUE.equals(filterable);
        }

        public boolean multiOrDefault() {
            return Boolean.TRUE.equals(multi);
        }

        public int sortOrDefault() {
            return sort == null ? 0 : sort;
        }
    }
}
