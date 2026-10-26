package com.shop.platform.catalog.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 标准品运营视图。
 *
 * <p>{@code mergedInto} 非空 = 这一行已被并入别处，不能再被挂靠。运营要看得到它——
 * 合并错了要能顺着这一列查回去，否则只能翻审计。
 *
 * @param boundCount 有多少商家商品挂在它上面。运营判「这条该不该合」时看的就是它：
 *     挂 3 个的和挂 300 个的，合并方向完全不同
 */
public record StandardSpuView(
        UUID spuId,
        String title,
        UUID categoryId,
        UUID brandId,
        String modelNo,
        String identityKind,
        String matchKey,
        UUID mergedInto,
        OffsetDateTime createdAt,
        long boundCount) {

    /** 卖家挂靠候选：只出可用的（已合并的不出现），字段比运营视图少一半。 */
    public record Candidate(UUID spuId, String title, String modelNo, long boundCount) {}
}
