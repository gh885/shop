package com.shop.platform.product.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 一个规格维度的选择：attrId 定位类目模板属性，valueIds 选值域内值，customValues 提交值域外新值
 * （仅当属性 allow_custom 时受理，自动建档为卖家来源值）。两列表至少一非空——这一条判在
 * {@code SkuService.resolveSelections}（跨字段「至少其一」约束 rule 词表表达不了，升格为码
 * {@code SPEC_SELECTION_EMPTY}），不在这里写 {@code @AssertTrue}：那一发只出后端中文，界面换语言就露馅。
 */
public record SpecSelectionRequest(
        @NotNull UUID attrId,
        @Size(max = ProductFieldRules.SPEC_VALUES_MAX) List<UUID> valueIds,
        @Size(max = ProductFieldRules.SPEC_VALUES_MAX)
                List<@Size(max = CategoryFieldRules.ATTR_VALUE_MAX) String> customValues,
        /** 模板取值（valueId）→ 取值图 */
        Map<UUID, String> valueImages,
        /** 自定义取值文本 → 取值图 */
        Map<String, String> customValueImages) {}
