package com.shop.platform.order.dto;

import com.shop.platform.order.model.AfterSaleType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 申请售后入参。type 直接声明为枚举：非法值由消息转换器挡在 400，不必在 service 里手写解析。
 * reason 为买家填写的售后理由（可空）。
 */
public record ApplyAfterSaleRequest(@NotNull AfterSaleType type, @Size(max = 200) String reason) {}
