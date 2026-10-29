package com.shop.platform.seller.dto;

import jakarta.validation.constraints.Size;

/** 关店入参。理由可选，进审计；关店是终态，没有二次确认端点。 */
public record CloseShopRequest(@Size(max = 500) String reason) {}
