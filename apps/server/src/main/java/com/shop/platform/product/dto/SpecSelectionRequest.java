package com.shop.platform.product.dto;

import com.shop.platform.product.service.SkuService.SpecSelection;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 一个规格维度的选择：attrId 定位类目模板属性，valueIds 选值域内值，customValues 提交值域外新值
 * （仅当属性 allow_custom 时受理，自动建档为卖家来源值）。两列表至少一非空。
 */
public record SpecSelectionRequest(
        @NotNull UUID attrId,
        @Size(max = ProductFieldRules.SPEC_VALUES_MAX) List<UUID> valueIds,
        @Size(max = ProductFieldRules.SPEC_VALUES_MAX)
                List<@Size(max = CategoryFieldRules.ATTR_VALUE_MAX) String> customValues,
        /** 模板取值（valueId）→ 取值图 */
        Map<UUID, String> valueImages,
        /** 自定义取值文本 → 取值图 */
        Map<String, String> customValueImages) {

    /** 两列表至少一非空（getter 命名，Bean Validation 才识别为约束属性） */
    @AssertTrue(message = "valueIds 与 customValues 至少一个非空")
    public boolean isSelectionPresent() {
        return (valueIds != null && !valueIds.isEmpty()) || (customValues != null && !customValues.isEmpty());
    }

    /** 映射为 service 入参 */
    public SpecSelection toSelection() {
        return new SpecSelection(attrId, valueIds, customValues, valueImages, customValueImages);
    }
}
