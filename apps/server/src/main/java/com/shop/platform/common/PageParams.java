package com.shop.platform.common;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** 通用分页参数：各列表端点复用，compact constructor 补默认值（page=1, size=10） */
public record PageParams(@Min(1) Integer page, @Min(1) @Max(100) Integer size) {
    public PageParams {
        page = page == null ? 1 : page;
        size = size == null ? 10 : size;
    }
}
