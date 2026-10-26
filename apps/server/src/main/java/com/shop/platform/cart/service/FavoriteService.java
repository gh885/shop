package com.shop.platform.cart.service;

import com.shop.platform.cart.mapper.FavoriteMapper;
import com.shop.platform.cart.mapper.FavoriteMapper.FavoriteRow;
import com.shop.platform.cart.service.FavoriteViews.ExistsResult;
import com.shop.platform.cart.service.FavoriteViews.FavoriteLine;
import com.shop.platform.cart.service.FavoriteViews.FavoritePage;
import com.shop.platform.cart.service.FavoriteViews.ToggleResult;
import com.shop.platform.catalog.api.CatalogQuery;
import com.shop.platform.catalog.api.CatalogQuery.SellableSpu;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.FavoriteRules;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.web.CursorCodec;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 收藏夹：只存「谁收了哪个商品」，商品事实一律读时拼装。
 *
 * <p><b>三条硬边界：</b>
 *
 * <ul>
 *   <li><b>收藏时不校验可售。</b> 这是与购物车最大的不同。加购拦不可售（拦的是「现在就想买」），
 *       收藏不拦——「先收着，等降价/等有货」正是收藏存在的理由。拦了它，收藏就成了半个购物车。
 *       代价是列表里会有失效行，所以读侧必须置灰（{@link #list}）。
 *   <li><b>不存商品快照。</b> 标题、图、价都不落库。落库就要处理「商家改了标题，收藏夹里的旧标题
 *       要不要跟着变」——那是缓存失效问题，而收藏列表不是热路径，读时拼一次更便宜也更准。
 *   <li><b>不调 pricing。</b> 列表展示的是 catalog 的提示性现价，与购物车同一条规矩：
 *       报价单要地址才能算运费、要落四张证据表，收藏页两样都没有。真实价格锚点在结算页。
 * </ul>
 */
@Service
public class FavoriteService {

    /** 列表默认 20 条，最多 100——不设上限等于给一个拉全表的入口。 */
    private static final int DEFAULT_PAGE_SIZE = 20;

    private static final int MAX_PAGE_SIZE = 100;

    private final FavoriteMapper items;
    private final CatalogQuery catalog;

    public FavoriteService(FavoriteMapper items, CatalogQuery catalog) {
        this.items = items;
        this.catalog = catalog;
    }

    /**
     * 收藏。幂等：重复收藏同一个商品返回 {@code created=false}，不报错、不刷新时间。
     *
     * <p>不校验可售——见类注释。也不校验 spuId 是否存在：一个不存在的 spuId 收藏进来，
     * 列表里就是一条永久置灰的行，看起来像 bug。所以这里**只拦明显非法的**（null），
     * 存在性交给读侧——但那样会让刷量把垃圾行写进库。
     *
     * <p>折中是：**收藏时查一次存在性**（用 catalog 的批查，一次往返），
     * 查不到就 404。这与「不校验可售」不矛盾——不存在的商品和已下架的商品是两件事：
     * 前者是输入错误，后者是正常状态。
     */
    @Transactional
    public ToggleResult add(UUID buyerId, UUID spuId) {
        if (catalog.findSellableSpusByIds(List.of(spuId)).isEmpty()) {
            // 用 404 而不是 400：不存在的资源就是不存在，与「下架」共用同一个码会让人分不清。
            throw BusinessException.notFound("商品不存在: " + spuId);
        }
        boolean inserted = items.insert(Ids.newId(), buyerId, spuId) > 0;
        if (!inserted) {
            // 重复收藏：幂等命中。不占新坑，所以不查上限
            return new ToggleResult(spuId, true, false);
        }
        // 只在真的插进去之后判上限，超了就抛——事务回滚，刚插的那行一起没
        long total = items.countByBuyer(buyerId);
        if (total > FavoriteRules.ITEM_KINDS_MAX) {
            throw BusinessException.badRequestWithParams(
                    ErrorCodes.FAVORITE_FULL,
                    "收藏夹最多存放 " + FavoriteRules.ITEM_KINDS_MAX + " 件商品",
                    Map.of("limit", FavoriteRules.ITEM_KINDS_MAX));
        }
        return new ToggleResult(spuId, true, true);
    }

    /**
     * 取消收藏。0 行静默通过——toggle 语义下「取消一个没收藏的东西」不是错误。
     *
     * <p>不校验 spuId 存在性：一个商品被删了，买家仍然要能把它从收藏里去掉。
     */
    @Transactional
    public void remove(UUID buyerId, UUID spuId) {
        items.delete(buyerId, spuId);
    }

    /**
     * 收藏列表。展示数据一次批查（catalog 的 SPU 级可售事实），内存拼装——
     * 禁止跨 schema JOIN、不做 N+1。
     *
     * <p>失效行原样保留并置灰（{@code available=false}），不过滤掉。
     */
    @Transactional(readOnly = true)
    public FavoritePage list(UUID buyerId, String cursor, int limit) {
        int pageSize = Math.clamp(limit, 1, MAX_PAGE_SIZE);
        CursorCodec.Point point = cursor == null || cursor.isBlank() ? null : CursorCodec.decode(cursor);

        // 多取一条用来判断「还有下一页」——比 count 一次便宜，也避免两次查询之间数据变化导致的漂移
        List<FavoriteRow> rows = items.listPage(
                buyerId,
                point == null ? null : OffsetDateTime.ofInstant(point.createdAt(), ZoneOffset.UTC),
                point == null ? null : point.id(),
                pageSize + 1);

        boolean hasMore = rows.size() > pageSize;
        List<FavoriteRow> page = hasMore ? rows.subList(0, pageSize) : rows;

        if (page.isEmpty()) {
            return new FavoritePage(List.of(), null, items.countByBuyer(buyerId));
        }

        Map<UUID, SellableSpu> sellable = catalog.findSellableSpusByIds(
                page.stream().map(FavoriteRow::spuId).distinct().toList());

        List<FavoriteLine> lines =
                page.stream().map(row -> toLine(row, sellable.get(row.spuId()))).toList();

        String nextCursor = hasMore
                ? CursorCodec.encode(
                        page.getLast().createdAt().toInstant(), page.getLast().id())
                : null;
        return new FavoritePage(lines, nextCursor, items.countByBuyer(buyerId));
    }

    /**
     * 失效行与有效行的区别只在 {@code available} 与商品字段是否为 null：
     * 行本身（spuId、收藏时间）照旧给，前端才能渲染「这个商品已失效 · 收起/删除」。
     */
    private static FavoriteLine toLine(FavoriteRow row, SellableSpu sku) {
        if (sku == null) {
            return new FavoriteLine(row.spuId(), null, null, null, false, row.createdAt());
        }
        return new FavoriteLine(row.spuId(), sku.title(), sku.imageUrl(), sku.minPrice(), true, row.createdAt());
    }

    /**
     * 「这些商品里我收藏了哪几个」。详情页心形状态、商品卡片小红心用。
     *
     * <p>批量上限在 DTO 的 {@code @Size} 上，这里不重复判——两处判断迟早会漂。
     */
    @Transactional(readOnly = true)
    public ExistsResult exists(UUID buyerId, Collection<UUID> spuIds) {
        if (spuIds.isEmpty()) {
            return new ExistsResult(List.of());
        }
        return new ExistsResult(List.copyOf(items.favoritedSpuIds(buyerId, spuIds)));
    }

    /** 注销时的整车清理（{@code AccountDeletionExecutor} 调）。 */
    @Transactional
    public void deleteAllOf(UUID buyerId) {
        items.deleteByBuyer(buyerId);
    }
}
