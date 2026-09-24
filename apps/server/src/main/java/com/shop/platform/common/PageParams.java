package com.shop.platform.common;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * 通用分页参数：各列表端点复用，compact constructor 补默认值（page=1, size=10）。
 *
 * <p>{@link #SIZE_MAX} 是「一次最多要几条」在服务器侧的唯一出处：它不对应任何列宽，而是入口上的防刷闸门，
 * 所有走 {@code PageParams} 的列表端点共用这一档。各页面自己选一次取几条（如券列表的 10）是产品决定，
 * 不是镜像，所以那一类常量不回指这里。
 */
public record PageParams(@Min(1) Integer page, @Min(1) @Max(PageParams.SIZE_MAX) Integer size) {

    /** 一页最多几条：超出就是拿列表页当导出用，而分页游标不是给导出用的 */
    public static final int SIZE_MAX = 100;

    /** 不传 size 时每页几条 */
    public static final int DEFAULT_SIZE = 10;

    public PageParams {
        page = page == null ? 1 : page;
        size = size == null ? DEFAULT_SIZE : size;
    }
}
