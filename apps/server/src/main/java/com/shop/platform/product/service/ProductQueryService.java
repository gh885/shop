package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.dto.ProductQuery;
import com.shop.platform.product.dto.ProductSort;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuMapper;
import com.shop.platform.product.model.ProductStatus;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 商品只读：卖家工作台列表 / 详情（按店铺上下文圈定，全状态）与买家侧公开列表 / 详情（只看上架、SKU 只返在售）。
 * 写路径在 {@link ProductService}（SPU 生命周期）与 {@link SkuService}（规格 / SKU）。
 */
@Service
@RequiredArgsConstructor
public class ProductQueryService {

    private final ProductMapper productMapper;
    private final SkuMapper skuMapper;
    private final StockReadQuery stockReadQuery;
    private final CategoryService categoryService;

    // 卖家侧
    /**
     * 卖家工作台商品列表：分页 + 每行补库存指标，可按 库存/销量/创建时间 排序。
     *
     * <p>库存：商品全部 SKU → inventory.api 批查可用量 → 按商品 sum（分列已有 min/max，库存是运营要看的总可售）。
     * 销量：products.sold_count 投影列，订单完成时经 product.api :: ProductCommand 累加，随实体一起读出。
     * 库存/销量都是纯展示指标，与 SPU 状态正交（草稿/仓库中也可能有历史销量）。
     *
     * <p>createdAt / soldCount 是 product 表列，直接 DB 排序分页；库存是跨模块聚合（inventory api），
     * 且本项目禁止跨 schema JOIN，无法在 SQL 层「按聚合指标排序后再分页」→ 改取店铺（筛选后）全量商品、
     * 内存聚合指标排序、再手动分页。代价是每次请求遍历该店铺全部商品，对单个卖家目录规模可接受。
     */
    public PageResult<ProductListRow> pageListWithMetrics(
            UUID shopId, ProductStatus status, String keyword, long page, long size, String sort) {
        boolean sortByStock = "stock_asc".equals(sort) || "stock_desc".equals(sort);

        // 默认/创建时间/销量：走 DB 分页，库存只对本页补
        if (!sortByStock) {
            PageResult<Product> result = pageList(shopId, status, keyword, page, size, sort);
            return new PageResult<>(rowsFrom(result.records(), stockFor(result.records())), result.total());
        }

        // 库存：全量聚合 → 内存排序 → 手动分页；降序时 id 同样降序兜底，保证翻页顺序稳定（对齐 DB orderByDesc(id) 口径）
        List<Product> all = productMapper.selectList(filter(shopId, status, keyword));
        Map<UUID, Integer> stock = stockFor(all);
        Comparator<Product> byStock = Comparator.comparingInt((Product p) -> stock.getOrDefault(p.getId(), 0));
        Comparator<Product> byId = Comparator.comparing(Product::getId);
        Comparator<Product> order = "stock_asc".equals(sort)
                ? byStock.thenComparing(byId)
                : byStock.reversed().thenComparing(byId.reversed());
        List<Product> pageProducts = all.stream()
                .sorted(order)
                .skip(Math.max(0, (page - 1) * size))
                .limit(size)
                .toList();
        return new PageResult<>(rowsFrom(pageProducts, stock), all.size());
    }

    /** 商品详情：SPU 全字段 + SKU（卖家编辑只回显「当前 spec 组合」的行——对账停用的历史残留不打扰卖家，行保留不物理删） */
    public ProductDetail detail(UUID shopId, UUID productId) {
        Product product = productMapper.requireShopOwned(shopId, productId);
        Set<String> currentSpecKeys = product.currentSpecKeys();
        List<Sku> skus = skuMapper.selectByProductId(productId).stream()
                .filter(s -> currentSpecKeys.contains(s.getSpecKey()))
                .toList();
        return new ProductDetail(product, skus);
    }

    // 买家侧公开读
    /**
     * 买家侧商品列表：可按类目/店铺/关键词筛选并排序。
     *
     * <p>与 pageList 的关键差别：status 写死上架，不接受前端指定，草稿/下架商品对买家不存在。 价格排序直接吃 minPrice/maxPrice 冗余副本，免查 SKU
     * 表——这两个字段的存在意义就在此。
     *
     * <p>categoryId 过滤与 feed 召回（ProductRecallQuery）同口径：经 CategoryService 展开启用子树
     * （tab/筛选可指一级类目、商品挂三级叶子），父链上任一节点禁用即整支不可见——未知/禁用类目得到空集，
     * 直接返回空页而不是报错（脏链接不该把列表页打成错误页），不 JOIN 类目表（同模块也不跨 schema 裸 SQL）。
     */
    public PageResult<Product> pagePublic(ProductQuery query, long page, long size) {
        // StringBuilder.blankToNull 与 pageList 同口径：no keyword 时归一为 null，免 NPE；hasText 再兜底
        String keyword = query.keyword() == null ? null : query.keyword().trim();
        // 类目条件先过可见性展开：空集 = 该类目对买家不存在，短路空页，不发商品表查询
        List<UUID> visibleCategoryIds = null;
        if (query.categoryId() != null) {
            visibleCategoryIds = List.copyOf(categoryService.descendantIds(query.categoryId()));
            if (visibleCategoryIds.isEmpty()) {
                return new PageResult<>(List.of(), 0);
            }
        }
        LambdaQueryWrapper<Product> wrapper = new LambdaQueryWrapper<Product>()
                // 列表页只要卡片字段：不点名列就把 detail_images / images / specs / params 四个 JSONB 一起捞出来
                // （TOAST 外部存储读 + Jackson 反序列化），而 PublicProductResponse 一个都不用。列名与
                // PublicProductResponse.from 的取值一一对死——那个 record 加字段时这里必须同步加，
                // 否则新字段静默为 null（currency 也在内：min/maxPriceAsMoney 要在这一行闭合币种）。
                .select(
                        Product::getId,
                        Product::getShopId,
                        Product::getCategoryId,
                        Product::getName,
                        Product::getSubtitle,
                        Product::getMainImage,
                        Product::getMinPrice,
                        Product::getMaxPrice,
                        Product::getCurrency,
                        Product::getSoldCount,
                        Product::isSevenDayReturn)
                .eq(Product::getStatus, ProductStatus.PUBLISHED)
                .in(visibleCategoryIds != null, Product::getCategoryId, visibleCategoryIds)
                .eq(query.shopId() != null, Product::getShopId, query.shopId())
                .like(StringUtils.hasText(keyword), Product::getName, keyword);
        // 每种排序都补 id 兜底，保证翻页时同值记录顺序稳定（否则第 2 页可能重复第 1 页的行）
        switch (ProductSort.fromWire(query.sort())) {
            case PRICE_ASC -> wrapper.orderByAsc(Product::getMinPrice).orderByDesc(Product::getId);
            case PRICE_DESC -> wrapper.orderByDesc(Product::getMaxPrice).orderByDesc(Product::getId);
            case NEWEST -> wrapper.orderByDesc(Product::getCreatedAt).orderByDesc(Product::getId);
        }
        Page<Product> result = productMapper.selectPage(new Page<>(page, size), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    /** 买家侧商品详情：非上架商品一律 404（不泄露"存在但没上架"），SKU 只返在售 */
    public ProductDetail publicDetail(UUID productId) {
        Product product = Validate.notNull(productMapper.selectById(productId), "商品不存在");
        Validate.isTrue(product.isPublished(), 404, "商品不存在");
        List<Sku> skus = skuMapper.selectOnSaleByProductId(productId);
        return new ProductDetail(product, skus);
    }

    // 私有：卖家列表辅助
    /** 商家后台商品列表：按店铺分页，可按状态/名称筛选。createdAt / soldCount 都是表列，排序直接走 DB 分页（升降序由 sort 后缀控制） */
    private PageResult<Product> pageList(
            UUID shopId, ProductStatus status, String keyword, long page, long size, String sort) {
        LambdaQueryWrapper<Product> wrapper = filter(shopId, status, keyword);
        switch (sort == null ? "" : sort) {
            case "createdAt_asc" -> wrapper.orderByAsc(Product::getCreatedAt);
            case "soldCount_asc" -> wrapper.orderByAsc(Product::getSoldCount);
            case "soldCount_desc" -> wrapper.orderByDesc(Product::getSoldCount);
            default -> wrapper.orderByDesc(Product::getCreatedAt);
        }
        wrapper.orderByDesc(Product::getId);
        Page<Product> result = productMapper.selectPage(new Page<>(page, size), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    /** 店铺商品筛选条件：状态/名称，分页列表与「按库存排序」取全量集共用 */
    private static LambdaQueryWrapper<Product> filter(UUID shopId, ProductStatus status, String keyword) {
        // MP 的条件 boolean 参数不短路右侧表达式：keyword.trim() 必须先判空提取，否则无 keyword 请求 NPE
        String trimmedKeyword = keyword == null ? null : keyword.trim();
        return new LambdaQueryWrapper<Product>()
                .eq(Product::getShopId, shopId)
                .eq(status != null, Product::getStatus, status)
                .like(StringUtils.hasText(trimmedKeyword), Product::getName, trimmedKeyword);
    }

    /** 为给定商品集聚合库存（一次批查，供排序与行渲染共用）；缺失（无库存行）按 0 兜底 */
    private Map<UUID, Integer> stockFor(List<Product> products) {
        if (products.isEmpty()) {
            return Map.of();
        }
        // 批次捞全部 SKU → 批查库存可用量（缺省 0）→ 按商品求和
        List<Sku> skus = skuMapper.selectByProductIds(
                products.stream().map(Product::getId).toList());
        Map<UUID, StockView> stocks =
                stockReadQuery.availableBySkuIds(skus.stream().map(Sku::getId).toList());
        Map<UUID, Integer> stock = new HashMap<>();
        skus.forEach(s -> {
            StockView v = stocks.get(s.getId());
            stock.merge(s.getProductId(), v == null ? 0 : v.availableStock(), Integer::sum);
        });
        return stock;
    }

    /** 用已聚合的库存把商品实体映射为列表行，销量直接取投影列 */
    private static List<ProductListRow> rowsFrom(List<Product> products, Map<UUID, Integer> stock) {
        return products.stream()
                .map(p -> new ProductListRow(p, stock.getOrDefault(p.getId(), 0), p.getSoldCount()))
                .toList();
    }
}
