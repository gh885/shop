package com.shop.platform.cart.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
import com.shop.platform.infra.db.CrossSchemaReader;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class CartService {

    /** 单条目数量上限，与 DB CHECK 同值兜底；真实限购（秒杀限件）在下单校验 */
    private static final int MAX_QUANTITY_PER_ITEM = 999;

    /** 单用户购物车不同 SKU 条目上限，防刷；合并不受限 */
    private static final int MAX_ITEMS_PER_USER = 99;

    // product / shop schema 的状态值约定（裸 SQL 只读访问，不 import 对方模块类）
    private static final int SKU_STATUS_ON_SALE = 1;

    private static final int PRODUCT_STATUS_PUBLISHED = 1;

    /** product.skus 投影列（购物车视图需要的展示与可用性字段） */
    private static final List<String> SKU_COLUMNS =
            List.of("product_id", "name", "image", "price", "original_price", "currency", "stock", "status");

    /** product.products 投影列（卡片 + 可用性判断） */
    private static final List<String> PRODUCT_COLUMNS = List.of("shop_id", "name", "main_image", "status");

    private final CartItemMapper cartItemMapper;

    private final CrossSchemaReader reader;

    /** 加购：同 SKU 幂等合并为数量累加。停售/下架拒收，库存不足放行（闸门在下单） */
    @Transactional
    public CartItem add(UUID userId, AddCartItemRequest req) {
        // 1. 校验可加购：SKU 存在且在售、其 SPU 已上架（跨 schema 只读按 ID 查，禁止 JOIN）
        SkuRow sku = loadSku(req.skuId());
        Validate.isTrue(sku != null && sku.status() == SKU_STATUS_ON_SALE, "商品规格不存在或已停售");
        Integer spuStatus = loadProductStatus(sku.productId());
        Validate.isTrue(spuStatus != null && spuStatus == PRODUCT_STATUS_PUBLISHED, "商品已下架");

        // 2. 合并或新增：同 SKU 已在车里则累加封顶，否则插新行
        LambdaQueryWrapper<CartItem> byUserAndSku = new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .eq(CartItem::getSkuId, req.skuId());
        CartItem existing = cartItemMapper.selectOne(byUserAndSku);
        if (existing != null) {
            existing.setQuantity(Math.min(existing.getQuantity() + req.quantity(), MAX_QUANTITY_PER_ITEM));
            cartItemMapper.updateById(existing);
            return existing;
        }

        // 3. 新条目前查条目数上限防刷（并发窗口内微小越界可容忍：非资金安全线，唯一索引才是硬兜底）
        Long count = cartItemMapper.selectCount(new LambdaQueryWrapper<CartItem>().eq(CartItem::getUserId, userId));
        Validate.isTrue(count < MAX_ITEMS_PER_USER, "购物车最多存放 " + MAX_ITEMS_PER_USER + " 种商品");

        CartItem item = CartItem.builder()
                .userId(userId)
                .skuId(req.skuId())
                .quantity(req.quantity())
                .selected(true)
                .build();
        try {
            cartItemMapper.insert(item);
            log.info("[CART] 加购, userId={}, skuId={}, quantity={}", userId, req.skuId(), req.quantity());
            return item;
        } catch (DuplicateKeyException e) {
            // 4. 并发重复加购撞 uk_cart_items_user_sku：回退为合并
            CartItem raced = cartItemMapper.selectOne(byUserAndSku);
            Validate.notNull(raced, "购物车条目不存在");
            raced.setQuantity(Math.min(raced.getQuantity() + req.quantity(), MAX_QUANTITY_PER_ITEM));
            cartItemMapper.updateById(raced);
            return raced;
        }
    }

    /**
     * 整车列表：新加的在前。
     *
     * <p>展示数据三次只读 IN 批查（SKU → SPU → 店铺名）内存拼装，禁止跨 schema JOIN、不做 N+1；
     * 失效条目（SKU 被删/停售、SPU 下架）available=false 原样保留置灰。
     */
    public List<CartItemView> list(UUID userId) {
        // 1. 拉整车
        List<CartItem> items = cartItemMapper.selectList(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .orderByDesc(CartItem::getCreatedAt));
        if (items.isEmpty()) {
            return List.of();
        }

        // 2. 跨 schema 只读批查展示数据
        List<UUID> skuIds = items.stream().map(CartItem::getSkuId).distinct().toList();
        Map<UUID, SkuRow> skus = loadSkus(skuIds);
        List<UUID> productIds =
                skus.values().stream().map(SkuRow::productId).distinct().toList();
        Map<UUID, ProductRow> products = loadProducts(productIds);
        List<UUID> shopIds =
                products.values().stream().map(ProductRow::shopId).distinct().toList();
        Map<UUID, String> shopNames = loadShopNames(shopIds);

        // 3. 拼装视图
        return items.stream()
                .map(item -> assemble(item, skus, products, shopNames))
                .toList();
    }

    /** 角标计数：免拉整车 */
    public CartCount count(UUID userId) {
        long total = cartItemMapper.selectCount(new LambdaQueryWrapper<CartItem>().eq(CartItem::getUserId, userId));
        long selected = cartItemMapper.selectCount(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .eq(CartItem::getSelected, true));
        return new CartCount(total, selected);
    }

    /** 改数量或勾选：部分更新，null 字段保持原值 */
    @Transactional
    public CartItem update(UUID userId, UUID id, UpdateCartItemRequest req) {
        CartItem item = own(userId, id);
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
        own(userId, id);
        cartItemMapper.deleteById(id);
    }

    /** 批量删：清除失效商品/删除选中共用 */
    @Transactional
    public void batchRemove(UUID userId, BatchDeleteCartItemsRequest req) {
        cartItemMapper.delete(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .in(CartItem::getId, req.itemIds()));
    }

    // ========== 内部 ==========

    /** 取本人条目：不存在或不属于当前用户一律 404，不泄露他人数据存在性 */
    private CartItem own(UUID userId, UUID id) {
        CartItem item = Validate.notNull(cartItemMapper.selectById(id), "购物车条目不存在");
        if (!item.getUserId().equals(userId)) {
            throw BusinessException.notFound("购物车条目不存在");
        }
        return item;
    }

    /** 拼装单条视图：SKU 缺失 → 全空视图置灰；SPU 缺失 → 只剩 SKU 信息同样置灰 */
    private CartItemView assemble(
            CartItem item, Map<UUID, SkuRow> skus, Map<UUID, ProductRow> products, Map<UUID, String> shopNames) {
        SkuRow sku = skus.get(item.getSkuId());
        if (sku == null) {
            return new CartItemView(
                    item.getId(),
                    item.getSkuId(),
                    item.getQuantity(),
                    item.getSelected(),
                    item.getCreatedAt(),
                    null,
                    null,
                    false);
        }
        ProductRow product = products.get(sku.productId());
        CartItemView.SkuInfo skuInfo = new CartItemView.SkuInfo(
                sku.id(),
                sku.name(),
                sku.image(),
                money(sku.price(), sku.currency()),
                money(sku.originalPrice(), sku.currency()),
                sku.stock(),
                sku.status());
        // SPU 缺失（被删）：只剩 SKU 信息同样置灰，不触碰 product 字段
        if (product == null) {
            return new CartItemView(
                    item.getId(),
                    item.getSkuId(),
                    item.getQuantity(),
                    item.getSelected(),
                    item.getCreatedAt(),
                    null,
                    skuInfo,
                    false);
        }
        boolean available = product.status() == PRODUCT_STATUS_PUBLISHED && sku.status() == SKU_STATUS_ON_SALE;
        CartItemView.ProductInfo productInfo = new CartItemView.ProductInfo(
                product.id(), product.name(), product.mainImage(), product.shopId(), shopNames.get(product.shopId()));
        return new CartItemView(
                item.getId(),
                item.getSkuId(),
                item.getQuantity(),
                item.getSelected(),
                item.getCreatedAt(),
                productInfo,
                skuInfo,
                available);
    }

    // ========== 跨 schema 只读（经 infra CrossSchemaReader 按主键点查，禁止 JOIN） ==========

    /** product.skus 按 ID 批查展示字段 */
    private Map<UUID, SkuRow> loadSkus(List<UUID> skuIds) {
        return reader.byIds(
                "product.skus",
                SKU_COLUMNS,
                skuIds,
                rs -> new SkuRow(
                        rs.getObject("id", UUID.class),
                        rs.getObject("product_id", UUID.class),
                        rs.getString("name"),
                        rs.getString("image"),
                        rs.getObject("price", Long.class),
                        rs.getObject("original_price", Long.class),
                        rs.getString("currency"),
                        rs.getObject("stock", Integer.class),
                        rs.getObject("status", Integer.class)));
    }

    /** 单个 SKU 行（加购校验用），不存在返回 null */
    private SkuRow loadSku(UUID skuId) {
        return loadSkus(List.of(skuId)).get(skuId);
    }

    /** 单个 SPU 状态（加购校验用） */
    private Integer loadProductStatus(UUID productId) {
        return reader.byId(
                "product.products", List.of("status"), productId, rs -> rs.getObject("status", Integer.class));
    }

    /** product.products 按 ID 批查卡片字段 */
    private Map<UUID, ProductRow> loadProducts(List<UUID> productIds) {
        return reader.byIds(
                "product.products",
                PRODUCT_COLUMNS,
                productIds,
                rs -> new ProductRow(
                        rs.getObject("id", UUID.class),
                        rs.getObject("shop_id", UUID.class),
                        rs.getString("name"),
                        rs.getString("main_image"),
                        rs.getObject("status", Integer.class)));
    }

    /** shop.shops 按 ID 批查店名（按店铺分组展示用） */
    private Map<UUID, String> loadShopNames(List<UUID> shopIds) {
        return reader.stringsByIds("shop.shops", "name", shopIds);
    }

    private static Money money(Long fen, String currency) {
        if (fen == null) return null;
        return Money.ofFen(fen, currency != null ? currency : Money.CNY);
    }

    // ========== 只读投影 ==========

    /** product.skus 行投影（cart 视角只需要展示与可用性字段） */
    private record SkuRow(
            UUID id,
            UUID productId,
            String name,
            String image,
            Long price,
            Long originalPrice,
            String currency,
            Integer stock,
            Integer status) {}

    /** product.products 行投影 */
    private record ProductRow(UUID id, UUID shopId, String name, String mainImage, Integer status) {}

    /** 角标计数出参 */
    public record CartCount(long total, long selected) {}
}
