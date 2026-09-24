package com.shop.platform.shop.dto;

import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Text;
import com.shop.platform.infra.region.RegionRegistry;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 商家地址入参：新增/编辑复用（对齐淘宝地址库表单）。
 *
 * <p>district/postalCode 可空（直辖市/直筒子市无区级、邮编非必填）；
 * companyName（公司名称）= 面单寄件人；note（备注）可选。
 * defaultShip/defaultReturn 为 null 时：新增场景视为 false，编辑场景保持原值；为 true 时清掉本店同类默认。
 */
public record MerchantAddressRequest(
        @NotBlank @Size(max = 30) String contactName,
        @NotBlank @Pattern(regexp = PhoneNumber.CONTACT_PATTERN, message = "手机号格式不正确") String phone,
        /** 形状门（6 位数字）；是不是真有这么个区划，由 service 拿 {@link RegionRegistry} 判，两处同为 400 */
        @NotBlank @Pattern(regexp = RegionRegistry.CODE_PATTERN, message = "行政区划代码格式不正确") String regionCode,
        @NotBlank @Size(max = 30) String province,
        @NotBlank @Size(max = 30) String city,
        @Size(max = 30) String district,
        @NotBlank @Size(max = 120) String detail,
        /**
         * 邮政编码：形状与 {@link RegionRegistry#CODE_PATTERN} 撞车（同为 6 位数字），但它是另一个概念——
         * 邮编不参与区划校验、也不进 {@code regionCode} 那套存在性判定，所以刻意不引用同一个常量，
         * 免得一处放宽就改了另一处。
         */
        @Schema(nullable = true) @Size(max = 6) @Pattern(regexp = "^\\d{6}$", message = "邮编格式不正确") String postalCode,
        @Schema(nullable = true) @Size(max = 60) String companyName,
        @Schema(nullable = true) @Size(max = 200) String note,
        Boolean defaultShip,
        Boolean defaultReturn) {
    public MerchantAddressRequest {
        contactName = Text.trimToNull(contactName);
        phone = Text.trimToNull(phone);
        regionCode = Text.trimToNull(regionCode);
        province = Text.trimToNull(province);
        city = Text.trimToNull(city);
        district = Text.trimToNull(district);
        detail = Text.trimToNull(detail);
        postalCode = Text.trimToNull(postalCode);
        companyName = Text.trimToNull(companyName);
        note = Text.trimToNull(note);
    }
}
