package com.shop.platform.cart.service;

import com.shop.platform.common.money.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 收藏的读侧视图。刻意扁平：分组、排序、分页条数都由前端决定，服务端只给字段。
 */
public final class FavoriteViews {

    private FavoriteViews() {}

    /**
     * 列表的一行。
     *
     * <p>{@code available=false} 的行**原样保留并置灰**，不是过滤掉。
     * 这是有意的：收藏夹是买家的私人记忆，商品下架了就静默消失会让人以为「我没收藏过」。
     * 失效判定是读时做的（catalog 批查不到就是不可售），不落库、不订事件——
     * 覆盖所有失效原因（下架 / SKU 停售 / SPU 删除）且永不出错。
     *
     * @param available false = 现在买不到（listing 下架或 SKU 全停）
     * @param price 最低价；{@code available=true} 但价格为 null 表示「还在卖，暂无报价」
     *     （SPU 有 online listing，但所有 SKU 都 disabled）。这与不可售是两件事：
     *     前者是「等等可能就有了」，后者是「这个商品没了」。
     */
    public record FavoriteLine(
            UUID spuId, String title, String imageUrl, Money price, boolean available, OffsetDateTime favoritedAt) {}

    /**
     * 一页。{@code nextCursor} 为 null 就是最后一页。
     *
     * <p>{@code total} 与 {@code items} 一起返回，是因为收藏页要显示「共 N 件」，
     * 而这个数不该让前端再发一次请求（收藏页是最常被打开又立刻关掉的页面之一）。
     */
    public record FavoritePage(List<FavoriteLine> items, @Schema(nullable = true) String nextCursor, long total) {}

    /** 收藏 / 取消的结果。{@code created=false} 表示这次是重复收藏（幂等命中）。 */
    public record ToggleResult(UUID spuId, boolean favorited, boolean created) {}

    /** 「这些商品里我收藏了哪几个」。详情页心形状态、卡片小红心用。 */
    public record ExistsResult(List<UUID> favoritedSpuIds) {}
}
