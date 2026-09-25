package com.shop.platform.product.service;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.dto.ProductAdminSort;
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
     * <p>createdAt / soldCount 是 product 表列，排序与分页都在 DB 里闭合（取数口径见
     * {@code ProductMapper.selectPageByShop}）；库存是跨模块聚合（inventory api），且本项目禁止跨 schema
     * JOIN，无法在 SQL 层「按聚合指标排序后再分页」→ 改取店铺（筛选后）全量商品、
     * 内存聚合指标排序、再手动分页。代价是每次请求遍历该店铺全部商品，对单个卖家目录规模可接受。
     */
    public PageResult<ProductListRow> pageListWithMetrics(
            UUID shopId, ProductStatus status, String keyword, long page, long size, String sort) {
        ProductAdminSort effectiveSort = ProductAdminSort.fromWire(sort);

        // 默认/创建时间/销量：走 DB 分页，库存只对本页补
        if (!effectiveSort.byAggregatedStock()) {
            var rows = productMapper.selectPageByShop(paging(page, size), shopId, status, keyword, effectiveSort);
            List<Product> pageRows = rows.getRecords();
            return new PageResult<>(rowsFrom(pageRows, stockFor(pageRows)), rows.getTotal());
        }

        // 库存：全量聚合 → 内存排序 → 手动分页；降序时 id 同样降序兜底，保证翻页顺序稳定（对齐 DB orderByDesc(id) 口径）
        List<Product> all = productMapper.selectListByShop(shopId, status, keyword);
        Map<UUID, Integer> stock = stockFor(all);
        Comparator<Product> byStock = Comparator.comparingInt((Product p) -> stock.getOrDefault(p.getId(), 0));
        Comparator<Product> byId = Comparator.comparing(Product::getId);
        // switch 表达式（不是语句）强制穷尽：新增排序值忘了补这里编不过
        Comparator<Product> order =
                switch (effectiveSort) {
                    case STOCK_ASC -> byStock.thenComparing(byId);
                    case STOCK_DESC -> byStock.reversed().thenComparing(byId.reversed());
                    case CREATED_AT_DESC, CREATED_AT_ASC, SOLD_COUNT_ASC, SOLD_COUNT_DESC ->
                        throw new IllegalStateException("该排序键走 DB 分页，不进库存聚合分支");
                };
        List<Product> pageProducts = all.stream()
                .sorted(order)
                .skip(Math.max(0, (page - 1) * size))
                .limit(size)
                .toList();
        return new PageResult<>(rowsFrom(pageProducts, stock), all.size());
    }

    /**
     * 卖家详情出参：SPU 全字段 + 全部 SKU，两处库存都在这里补齐。
     *
     * <p>SPU 那一栏走 {@link #stockFor}（与列表行同一算法：全部 SKU 行求和），不复用详情展示行的库存——详情按
     * 当前 spec 组合过滤过行（对账停用的残留不打扰卖家），就地求和会和列表里的同名字段两个数。
     */
    public ProductDetailView sellerDetailView(UUID shopId, UUID productId) {
        ProductDetail d = detail(shopId, productId);
        return ProductDetailView.from(d, stocks(d.skus()), stockOf(d.product()));
    }

    /** 卖家单商品出参：库存按列表行同一口径补齐，不由调用方回默认为 0（曾经恒 0，同一个字段两种答案） */
    public ProductView sellerView(Product product) {
        return ProductView.from(product, stockOf(product));
    }

    /** SKU 行出参：批查一次可用库存后逐行补上（卖家提交规格 / 改 SKU 后的回显） */
    public List<SkuView> skuViews(List<Sku> skus) {
        Map<UUID, StockView> stocks = stocks(skus);
        return skus.stream().map(s -> SkuView.from(s, stocks.get(s.getId()))).toList();
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
     * <p>与卖家侧列表的关键差别：status 写死上架，不接受前端指定，草稿/下架商品对买家不存在。 价格排序直接吃 minPrice/maxPrice 冗余副本，免查 SKU
     * 表——这两个字段的存在意义就在此。
     *
     * <p>categoryId 过滤与 feed 召回（ProductRecallQuery）同口径：经 CategoryService 展开启用子树
     * （tab/筛选可指一级类目、商品挂三级叶子），父链上任一节点禁用即整支不可见——未知/禁用类目得到空集，
     * 直接返回空页而不是报错（脏链接不该把列表页打成错误页），不 JOIN 类目表（同模块也不跨 schema 裸 SQL）。
     */
    public PageResult<Product> pagePublic(ProductQuery query, long page, long size) {
        // 与卖家侧列表同口径：no keyword 时归一为 null，免 NPE；mapper 里的 hasText 再兜底
        String keyword = query.keyword() == null ? null : query.keyword().trim();
        // 类目条件先过可见性展开：空集 = 该类目对买家不存在，短路空页，不发商品表查询
        List<UUID> visibleCategoryIds = null;
        if (query.categoryId() != null) {
            visibleCategoryIds = List.copyOf(categoryService.descendantIds(query.categoryId()));
            if (visibleCategoryIds.isEmpty()) {
                return new PageResult<>(List.of(), 0);
            }
        }
        // 取数（投影列清单、关键字形状、每种排序补哪一列）见 ProductMapper.selectPublicPage；
        // 这里只交归一后的入参：可见类目集、店铺、trim 过的关键字、fromWire 出来的排序档
        var result = productMapper.selectPublicPage(
                paging(page, size), visibleCategoryIds, query.shopId(), keyword, ProductSort.fromWire(query.sort()));
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    /** 买家侧商品详情：非上架商品一律 404（不泄露"存在但没上架"），SKU 只返在售 */
    public ProductDetail publicDetail(UUID productId) {
        Product product = Validate.notNull(productMapper.selectById(productId), "商品不存在");
        Validate.present(product.isPublished(), "商品不存在");
        List<Sku> skus = skuMapper.selectOnSaleByProductId(productId);
        return new ProductDetail(product, skus);
    }

    /** 买家侧商品详情出参：在售 SKU 行带可用库存（装配收在查询服务，此前两个 controller 各抄一遍） */
    public PublicProductDetailView publicDetailView(UUID productId) {
        ProductDetail d = publicDetail(productId);
        return PublicProductDetailView.from(d, stocks(d.skus()));
    }

    // 私有：辅助（分页载体、库存聚合、行装配）
    /**
     * 分页载体：两个列表方法的入参沿用 controller 拆开的 {@code page}/{@code size}（不动 HTTP 形状），
     * 成形只在这一个出口发生——MyBatis-Plus 的 {@code Page} 由 mapper 内部自己 new。
     */
    private static PageParams paging(long page, long size) {
        return new PageParams(Math.toIntExact(page), Math.toIntExact(size));
    }

    /** 为给定商品集聚合库存（一次批查，供排序与行渲染共用）；缺失（无库存行）按 0 兜底 */
    private Map<UUID, Integer> stockFor(List<Product> products) {
        if (products.isEmpty()) {
            return Map.of();
        }
        // 批次捞全部 SKU → 批查库存可用量（缺省 0）→ 按商品求和
        List<Sku> skus = skuMapper.selectByProductIds(
                products.stream().map(Product::getId).toList());
        Map<UUID, StockView> stocks = stocks(skus);
        Map<UUID, Integer> stock = new HashMap<>();
        skus.forEach(s -> {
            StockView v = stocks.get(s.getId());
            stock.merge(s.getProductId(), StockView.availableOrZero(v), Integer::sum);
        });
        return stock;
    }

    /** 单个商品的库存总量：与列表行同一条口径（走 {@link #stockFor}），详情与写响应都用它，不再各算各的 */
    private int stockOf(Product product) {
        return stockFor(List.of(product)).getOrDefault(product.getId(), 0);
    }

    /** 跨模块批查 SKU 可用库存：skuId → StockView。全模块唯一的库存取数口，controller 不自己拼 */
    private Map<UUID, StockView> stocks(List<Sku> skus) {
        return stockReadQuery.availableBySkuIds(skus.stream().map(Sku::getId).toList());
    }

    /** 用已聚合的库存把商品实体映射为列表行，销量直接取投影列 */
    private static List<ProductListRow> rowsFrom(List<Product> products, Map<UUID, Integer> stock) {
        return products.stream()
                .map(p -> new ProductListRow(p, stock.getOrDefault(p.getId(), 0), p.getSoldCount()))
                .toList();
    }
}
