package com.shop.platform.cart.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.dto.BatchDeleteCartItemsRequest;
import com.shop.platform.cart.dto.UpdateCartItemRequest;
import com.shop.platform.cart.dto.UpdateCartSelectedRequest;
import com.shop.platform.cart.mapper.CartItem;
import com.shop.platform.cart.mapper.CartItemMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.api.ProductReadQuery;
import com.shop.platform.product.api.ProductView;
import com.shop.platform.product.api.SkuView;
import com.shop.platform.shop.api.ShopReadQuery;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class CartService {

    /** 单用户购物车不同 SKU 条目上限，防刷；合并不受限 */
    private static final int MAX_ITEMS_PER_USER = 99;

    private final CartItemMapper cartItemMapper;

    private final ProductReadQuery productReadQuery;

    private final StockReadQuery stockReadQuery;

    private final ShopReadQuery shopReadQuery;

    /** 加购：同 SKU 幂等合并为数量累加。停售/下架拒收，库存不足放行（闸门在下单） */
    @Transactional
    public CartItem add(UUID userId, AddCartItemRequest req) {
        // 1. 校验可加购：SKU 存在且在售、其 SPU 已上架（product :: api 按 ID 只读查，禁止 JOIN）
        SkuView sku =
                Validate.present(productReadQuery.skuById(req.skuId()).filter(SkuView::onSale), 400, "商品规格不存在或已停售");
        Validate.isTrue(
                productReadQuery
                        .productById(sku.productId())
                        .filter(ProductView::published)
                        .isPresent(),
                "商品已下架");

        // 2. 条目数上限防刷：车里已有该 SKU 时只累加数量、不占新坑，故不计入闸门
        //    （并发窗口内微小越界可容忍：非资金安全线，唯一索引才是硬兜底）
        if (cartItemMapper.selectByUserAndSku(userId, req.skuId()) == null) {
            Validate.isTrue(
                    cartItemMapper.countByUser(userId) < MAX_ITEMS_PER_USER, "购物车最多存放 " + MAX_ITEMS_PER_USER + " 种商品");
        }

        // 3. 一条 upsert 落库（见 CartItemMapper#upsertMerging）：新条目插入，同 SKU 累加封顶，
        //    并发重复加购由 ON CONFLICT 在行锁下合并——不能靠 catch DuplicateKeyException 回退，
        //    PG 撞唯一索引即中止整个事务，catch 后发不出任何语句
        CartItem item = cartItemMapper.upsertMerging(userId, req.skuId(), req.quantity());
        log.info("[CART] 加购, userId={}, skuId={}, quantity={}", userId, req.skuId(), req.quantity());
        return item;
    }

    /**
     * 整车列表：新加的在前。
     *
     * <p>展示数据三次只读 IN 批查（SKU → SPU → 店铺名，经 product / shop 的 api 包）内存拼装，
     * 禁止跨 schema JOIN、不做 N+1；失效条目（SKU 被删/停售、SPU 下架）available=false 原样保留置灰。
     */
    @Transactional(readOnly = true)
    public List<CartItemView> list(UUID userId) {
        // 1. 拉整车
        List<CartItem> items = cartItemMapper.selectWholeCart(userId);
        if (items.isEmpty()) {
            return List.of();
        }

        // 2. 跨模块只读批查展示数据
        List<UUID> skuIds = items.stream().map(CartItem::getSkuId).distinct().toList();
        Map<UUID, SkuView> skus = productReadQuery.skusByIds(skuIds);
        Map<UUID, StockView> stocks = stockReadQuery.availableBySkuIds(skuIds);
        List<UUID> productIds =
                skus.values().stream().map(SkuView::productId).distinct().toList();
        Map<UUID, ProductView> products = productReadQuery.productsByIds(productIds);
        List<UUID> shopIds =
                products.values().stream().map(ProductView::shopId).distinct().toList();
        Map<UUID, String> shopNames = shopReadQuery.namesByIds(shopIds);

        // 3. 拼装视图
        return items.stream()
                .map(item -> assemble(item, skus, stocks, products, shopNames))
                .toList();
    }

    /** 角标计数：免拉整车 */
    @Transactional(readOnly = true)
    public CartCount count(UUID userId) {
        long total = cartItemMapper.countByUser(userId);
        long selected = cartItemMapper.countSelectedByUser(userId);
        return new CartCount(total, selected);
    }

    /** 改数量或勾选：部分更新，null 字段保持原值 */
    @Transactional
    public CartItem update(UUID userId, UUID id, UpdateCartItemRequest req) {
        CartItem item = requireOwned(userId, id);
        if (req.quantity() != null) {
            item.setQuantity(req.quantity());
        }
        if (req.selected() != null) {
            item.setSelected(req.selected());
        }
        cartItemMapper.updateById(item);
        return item;
    }

    /** 批量勾选：itemIds 省略 = 整车全选/全不选；归属靠 SQL 带 user_id 条件 */
    @Transactional
    public void updateSelected(UUID userId, UpdateCartSelectedRequest req) {
        LambdaUpdateWrapper<CartItem> update = new LambdaUpdateWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .set(CartItem::getSelected, req.selected());
        if (req.itemIds() != null && !req.itemIds().isEmpty()) {
            update.in(CartItem::getId, req.itemIds());
        }
        cartItemMapper.update(null, update);
    }

    /** 删一条 */
    @Transactional
    public void remove(UUID userId, UUID id) {
        requireOwned(userId, id);
        cartItemMapper.deleteById(id);
    }

    /** 批量删：清除失效商品/删除选中共用 */
    @Transactional
    public void batchRemove(UUID userId, BatchDeleteCartItemsRequest req) {
        cartItemMapper.deleteByUserAndIds(userId, req.itemIds());
    }

    // ========== 内部 ==========

    /** 取本人条目：不存在或不属于当前用户一律 404，不泄露他人数据存在性 */
    private CartItem requireOwned(UUID userId, UUID id) {
        CartItem item = Validate.notNull(cartItemMapper.selectById(id), "购物车条目不存在");
        if (!item.getUserId().equals(userId)) {
            throw BusinessException.notFound("购物车条目不存在");
        }
        return item;
    }

    /** 拼装单条视图：SKU/SPU 缺失时对应段置 null，前端据此置灰；available = SPU 上架且 SKU 在售 */
    private CartItemView assemble(
            CartItem item,
            Map<UUID, SkuView> skus,
            Map<UUID, StockView> stocks,
            Map<UUID, ProductView> products,
            Map<UUID, String> shopNames) {
        SkuView sku = skus.get(item.getSkuId());
        ProductView product = sku == null ? null : products.get(sku.productId());
        boolean available = product != null && product.published() && sku.onSale();
        return new CartItemView(
                item.getId(),
                item.getSkuId(),
                item.getQuantity(),
                item.getSelected(),
                item.getCreatedAt(),
                product == null ? null : productInfo(product, shopNames),
                sku == null ? null : skuInfo(sku, stocks),
                available);
    }

    /** SKU 段：现价/原价 + 实时可用库存（加购到下单的比价窗口） */
    private static CartItemView.SkuInfo skuInfo(SkuView sku, Map<UUID, StockView> stocks) {
        StockView stock = stocks.get(sku.id());
        return new CartItemView.SkuInfo(
                sku.id(),
                sku.name(),
                sku.image(),
                money(sku.price(), sku.currency()),
                money(sku.originalPrice(), sku.currency()),
                stock == null ? 0 : stock.availableStock(),
                sku.status());
    }

    /** SPU 段：卡片字段 + 店铺名 */
    private static CartItemView.ProductInfo productInfo(ProductView product, Map<UUID, String> shopNames) {
        return new CartItemView.ProductInfo(
                product.id(), product.name(), product.mainImage(), product.shopId(), shopNames.get(product.shopId()));
    }

    private static Money money(Long fen, String currency) {
        if (fen == null) return null;
        return Money.ofFen(fen, currency != null ? currency : Money.CNY);
    }
}
