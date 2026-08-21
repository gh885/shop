package com.shop.platform.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 智能粘贴入参：一段待解析的收货文本 */
public record AddressParseRequest(@NotBlank @Size(max = 500) String text) {
    public AddressParseRequest {
        if (text != null) {
            text = text.trim();
        }
    }
}
