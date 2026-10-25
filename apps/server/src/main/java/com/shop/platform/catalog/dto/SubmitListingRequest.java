package com.shop.platform.catalog.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** 把 SPU 挂到某个店铺售卖。 */
public record SubmitListingRequest(@NotNull UUID shopId) {}
