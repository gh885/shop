package com.shop.platform.account.dto;

import com.shop.platform.common.AddressFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 智能粘贴入参：一段待解析的收货文本 */
public record AddressParseRequest(@NotBlank @Size(max = AddressFieldRules.PARSE_TEXT_MAX) String text) {
    public AddressParseRequest {
        if (text != null) {
            text = text.trim();
        }
    }
}
