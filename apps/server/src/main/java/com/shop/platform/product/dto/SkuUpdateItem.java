package com.shop.platform.product.dto;

import com.shop.platform.common.Money;
import com.shop.platform.product.model.SkuStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * 单个 SKU 的更新项，批量提交。price/stock 必填；其余只 set 非空字段，传 null 不改。
 *
 * <p>价格是 Money（分 + 币种）而不是裸分：入参与出参同一口径，服务端不用猜单位与币种。
 * 平台一期只认定价币种（DB 侧以 {@code CHECK (currency = 'CNY')} 钉死），越界币种在这里就 400，
 * 不等它撞上班约变成 500。
 */
public record SkuUpdateItem(
        @NotNull UUID skuId,
        @Size(max = ProductFieldRules.SKU_NAME_MAX) String name,
        @Size(max = ProductFieldRules.IMAGE_KEY_MAX) String image,
        @NotNull Money price,
        /** 划线价，可空（不画删除线）；传 null 不改 */
        Money originalPrice,
        @NotNull @Min(0) Integer stock,
        /** 业务编码（仓管/ERP 对账用），全局唯一；传 null 不改，重复会 409 */
        @Size(max = ProductFieldRules.SKU_CODE_MAX) String skuCode,
        /** 在售 / 停用；传 null 不改 */
        @Schema SkuStatus status) {

    public SkuUpdateItem {
        if (price != null) {
            price.requirePlatformCurrency();
        }
        if (originalPrice != null) {
            originalPrice.requirePlatformCurrency();
        }
    }
}
