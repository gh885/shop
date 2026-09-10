package com.shop.platform.logistics.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 承运商推送报文入参。
 *
 * <p>{@code requestData} 是对方签名的<b>原始字符串</b>（不是我们的 DTO）：验签必须对原文做摘要，
 * 先反序列化再拼回去会因字段顺序/空格差异导致签名不匹配——这是接入外部推送最常见的坑。
 */
public record CarrierPushRequest(@NotBlank String requestData, @NotBlank String dataSign) {}
