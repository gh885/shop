package com.shop.platform.seller.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 新建 / 编辑运费模板的入参。
 *
 * <p>{@code chargeBy} 收字符串而不是枚举：库里存 {@code piece} / {@code weight}，
 * 前端照着这个写。让 Jackson 直接绑枚举，大小写不对会变成反序列化失败（400 但说不清哪个字段），
 * 而这里的 400 能带一句人话。
 *
 * <p>{@code freeOver} 是可空的：{@code null} = 不包邮。0 是"满 0 元包邮"，等于永远包邮——
 * 两者语义不同，所以不能用 0 当"没设置"。
 */
public record ShippingTemplateRequest(
        /** 只在新建时用；编辑时忽略，模板归哪家店不随编辑变。 */
        UUID shopId,
        @NotBlank @Size(max = 50) String name,
        @NotBlank String chargeBy,
        @PositiveOrZero Long freeOver,
        @NotEmpty @Valid List<RegionRequest> regions) {

    /**
     * 一条地区费率。{@code areaCodes} 为空表示默认项，必须有且只有一条。
     *
     * <p>用包装类型而不是 {@code long}：基本类型缺失时默认 0，而 0 在这里是非法值，
     * 会变成"没填"和"填错"分不出来。包装类型能让 {@code @NotNull} 说实话。
     */
    public record RegionRequest(
            List<String> areaCodes,
            @NotNull @Min(1) Long first,
            @NotNull @PositiveOrZero Long firstFee,
            @NotNull @Min(1) Long additional,
            @NotNull @PositiveOrZero Long additionalFee) {}
}
