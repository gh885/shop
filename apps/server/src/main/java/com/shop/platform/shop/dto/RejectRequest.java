package com.shop.platform.shop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RejectRequest(@NotBlank @Size(max = 255) String reason) {}
