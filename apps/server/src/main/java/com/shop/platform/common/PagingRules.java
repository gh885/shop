package com.shop.platform.common;

/**
 * 游标分页的统一上限。
 *
 * <p>cursor 翻页没有 OFFSET 成本，但客户端可控的 {@code LIMIT} 仍要封顶：不封顶的话
 * {@code limit=10000000} 就是一次全表拉取。所有 cursor 分页入口的 {@code limit} 参数
 * 一律 {@code @Min(1) @Max(PagingRules.MAX_LIMIT)}，缺页时由方法级校验拦下。
 * （main 分支的对应物是 {@code PageParams.SIZE_MAX}，换 cursor 分页时一度丢失。）
 */
public final class PagingRules {

    /** 单页最大条数。 */
    public static final int MAX_LIMIT = 100;

    private PagingRules() {}
}
