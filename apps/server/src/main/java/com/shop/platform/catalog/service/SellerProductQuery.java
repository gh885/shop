package com.shop.platform.catalog.service;

import com.shop.platform.catalog.mapper.SellerProductListMapper;
import com.shop.platform.catalog.mapper.SellerProductListMapper.Row;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.web.CursorCodec;
import com.shop.platform.inventory.api.InventoryQuery;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 卖家商品列表。
 *
 * <p><b>为什么这个类必须存在。</b> 在它之前，商家没有任何办法列出自己的商品——所有商品端点的
 * 路径参数都是 {@code spuId}，而他拿不到那些 id。于是「建完商品、想再改一下」这条路在界面上
 * 是不可达的：接口都在，入口没有。卖家订单列表当初缺的是同一个东西。
 *
 * <h2>三条设计决定</h2>
 *
 * <ul>
 *   <li><b>游标分页，不是 offset。</b> 商家发新商品时 offset 分页会漏掉或重复条目——
 *       第 2 页的 {@code OFFSET 20} 在第 1 页之后新增了 3 个商品时，会重新返回第 1 页的
 *       最后 3 条。全项目列表都是游标（{@code CursorCodec}），这里不例外。
 *   <li><b>库存经 {@code inventory :: api} 批查，不跨 schema 读。</b> 列表 SQL 只出商品行，
 *       库存是第二个往返，一次拿全本页 SKU 的量。库存口径只有一处定义。
 *   <li><b>状态词表与 {@code listing.status} 同源。</b> 筛 "draft" 出来一列 "pending"
 *       就是事故，所以入参先过词表，不在词表里直接 400——而不是变成永远空页。
 * </ul>
 */
@Component
public class SellerProductQuery {

    /**
     * 可筛选的状态。<b>就是 {@code listing.status} 的取值加上「没有 listing」这一档。</b>
     *
     * <p>「没有 listing」映射成 {@code draft}：商家看到的语义是「草稿」，
     * 而库里那是一个还没有 listing 行的 SPU。这个词表是 SQL 里
     * {@code COALESCE(l.status, 'draft')} 的镜像，两处必须一起改。
     */
    private static final Set<String> STATUSES = Set.of("draft", "pending", "approved", "rejected", "online", "offline");

    /** 列表默认 20 条，最多 100——不设上限等于给一个拉全表的入口。 */
    private static final int DEFAULT_PAGE_SIZE = 20;

    private static final int MAX_PAGE_SIZE = 100;

    private final SellerProductListMapper products;
    private final InventoryQuery inventory;

    public SellerProductQuery(SellerProductListMapper products, InventoryQuery inventory) {
        this.products = Objects.requireNonNull(products, "products");
        this.inventory = Objects.requireNonNull(inventory, "inventory");
    }

    /**
     * 一页商品。
     *
     * @param status 展示态，null = 不过滤；不在词表里 400（不放进去变成永远空页）
     * @param keyword 标题模糊匹配，null / 空 = 不过滤
     * @param cursor 上一页的 {@code nextCursor}
     * @param limit 服务端 clamp 到 1–100
     */
    @Transactional(readOnly = true)
    public ProductPage page(UUID merchantId, String status, String keyword, String cursor, int limit) {
        requireKnownStatus(status);
        int pageSize = Math.clamp(limit, 1, MAX_PAGE_SIZE);
        CursorCodec.Point point = cursor == null || cursor.isBlank() ? null : CursorCodec.decode(cursor);

        // 多取一条只为判断有没有下一页——比 count 一次便宜，也避免两次查询之间的数据漂移
        List<Row> rows = products.page(
                merchantId,
                status,
                keyword == null || keyword.isBlank() ? null : keyword.trim(),
                point == null ? null : point.createdAt(),
                point == null ? null : point.id(),
                pageSize + 1);

        boolean hasMore = rows.size() > pageSize;
        List<Row> page = hasMore ? rows.subList(0, pageSize) : rows;

        Map<UUID, Integer> stock = stockOf(page);
        List<Item> items = page.stream().map(row -> toItem(row, stock)).toList();

        String nextCursor = hasMore
                ? CursorCodec.encode(page.getLast().createdAt(), page.getLast().spuId())
                : null;
        return new ProductPage(items, nextCursor, counts(merchantId));
    }

    /**
     * 本页库存：一次批查拿全。
     *
     * <p>两步而不是一步：先问「本页商品有哪些 active SKU」，再问「这些 SKU 各有多少货」。
     * 因为 {@code catalog} 知道哪些 SKU 属于自己，{@code inventory} 知道每个 SKU 有多少——
     * 各管各的，谁也不用读对方的表。
     *
     * <p>商品没有 active SKU（全停售）时库存是 0，不是「查不到」。
     */
    private Map<UUID, Integer> stockOf(List<Row> page) {
        if (page.isEmpty()) {
            return Map.of();
        }
        List<UUID> spuIds = page.stream().map(Row::spuId).toList();
        Map<UUID, List<UUID>> skusBySpu = new HashMap<>();
        for (SellerProductListMapper.SkuOfSpu row : products.activeSkuIds(spuIds)) {
            skusBySpu
                    .computeIfAbsent(row.spuId(), key -> new java.util.ArrayList<>())
                    .add(row.skuId());
        }
        Collection<UUID> allSkuIds =
                skusBySpu.values().stream().flatMap(List::stream).toList();
        Map<UUID, Integer> perSku = inventory.availableAcrossWarehouses(allSkuIds);

        // 按商品求和：商家看列表要的是「这个商品还有多少货」，不是每个 SKU 的明细
        Map<UUID, Integer> perSpu = new LinkedHashMap<>();
        for (Map.Entry<UUID, List<UUID>> entry : skusBySpu.entrySet()) {
            perSpu.put(
                    entry.getKey(),
                    entry.getValue().stream()
                            .mapToInt(skuId -> perSku.getOrDefault(skuId, 0))
                            .sum());
        }
        return perSpu;
    }

    /**
     * 各状态的商品数，给筛选标签用。
     *
     * <p>{@code all} 是各状态之和，不额外查一次——两者必须来自同一个快照，
     * 否则会出现「全部 12，但四个标签加起来 11」这种让人怀疑数据坏了的显示。
     */
    private StatusCounts counts(UUID merchantId) {
        Map<String, Long> byStatus = new LinkedHashMap<>();
        long total = 0;
        for (SellerProductListMapper.StatusCount row : products.countByStatus(merchantId)) {
            byStatus.put(row.status(), row.total());
            total += row.total();
        }
        return new StatusCounts(total, Map.copyOf(byStatus));
    }

    private static Item toItem(Row row, Map<UUID, Integer> stock) {
        return new Item(
                row.spuId(),
                row.title(),
                row.subtitle(),
                row.categoryId(),
                // 没有 listing 行 = 草稿。库里没有这个值，所以在这里补上，
                // 与 SQL 里 COALESCE(l.status, 'draft') 同一口径
                row.listingStatus() == null ? "draft" : row.listingStatus(),
                row.rejectReason(),
                row.imageUrl(),
                row.skuCount(),
                row.minPriceAmount() == null ? null : new Money(row.minPriceAmount(), row.minPriceCurrency()),
                stock.getOrDefault(row.spuId(), 0),
                row.soldCount(),
                row.createdAt());
    }

    private static void requireKnownStatus(String status) {
        if (status == null || status.isBlank()) {
            return;
        }
        if (!STATUSES.contains(status)) {
            throw BusinessException.badRequest("未知的商品状态: " + status + "，可选 "
                    + String.join(" / ", STATUSES.stream().sorted().toList()));
        }
    }

    /**
     * 一页商品。
     *
     * @param nextCursor null = 最后一页
     * @param counts 各状态计数。与 {@code items} 同一快照，所以「全部」等于各标签之和
     */
    public record ProductPage(
            List<Item> items,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String nextCursor,
            StatusCounts counts) {}

    /**
     * 列表的一行。
     *
     * @param status 展示态。{@code draft} 表示还没有 listing 行
     * @param rejectReason 被驳回时的理由；其余情况 null。商家唯一能看见的审核反馈
     * @param minPrice null = 没有 active SKU（全停售），不是「价格为 0」
     * @param availableStock 本商品全部 active SKU 的可售量之和，跨仓。0 = 没货或没建过
     */
    @io.swagger.v3.oas.annotations.media.Schema(name = "SellerProductItem")
    public record Item(
            UUID spuId,
            String title,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String subtitle,
            UUID categoryId,
            String status,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String rejectReason,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String imageUrl,
            long skuCount,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Money minPrice,
            int availableStock,
            long soldCount,
            java.time.Instant createdAt) {}

    /**
     * 各状态的商品数。
     *
     * @param all 总数。等于 {@code byStatus} 之和——两者同一快照，所以前端不必自己加
     * @param byStatus 只包含**有商品**的状态；一个状态一个商品都没有时它不出现在这里
     */
    public record StatusCounts(long all, Map<String, Long> byStatus) {}
}
