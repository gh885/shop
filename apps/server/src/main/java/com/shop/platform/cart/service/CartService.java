package com.shop.platform.cart.service;

import com.shop.platform.cart.mapper.CartItemMapper;
import com.shop.platform.cart.mapper.CartItemRow;
import com.shop.platform.cart.service.CartViews.AddedItem;
import com.shop.platform.cart.service.CartViews.CartCount;
import com.shop.platform.cart.service.CartViews.CartLine;
import com.shop.platform.cart.service.CartViews.CartView;
import com.shop.platform.cart.service.CartViews.SkuInfo;
import com.shop.platform.catalog.api.CatalogQuery;
import com.shop.platform.catalog.api.CatalogQuery.SellableSku;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.CartRules;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.seller.api.ShopQuery;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 购物车：只存选购意图，不锁价不锁库存。
 *
 * <p>与算价的分工是硬边界：cart 页面展示 catalog 的提示性现价，永不调 pricing——报价单要
 * address 才能算运费、要落四张证据表，购物车页两样都没有。真实价格锚点在结算页：
 * 前端拿勾选条目拼 {@code POST /api/quotes}，cart 的角色到「提供勾选行的 skuId+quantity」为止。
 */
@Service
public class CartService {

    private final CartItemMapper items;
    private final CatalogQuery catalog;
    private final ShopQuery shops;

    public CartService(CartItemMapper items, CatalogQuery catalog, ShopQuery shops) {
        this.items = items;
        this.catalog = catalog;
        this.shops = shops;
    }

    /**
     * 加购：同 SKU 幂等合并为数量累加封顶。不可售拒收（加购闸门拦「现在就想买」），
     * 库存不足放行——闸门在下单，cart 不做第二份库存。
     */
    @Transactional
    public AddedItem add(UUID buyerId, UUID skuId, int quantity) {
        if (catalog.findSellable(skuId).isEmpty()) {
            throw BusinessException.badRequest(ErrorCodes.CART_SKU_NOT_SELLABLE, "商品已下架或停售");
        }
        // 条目数上限防刷：车内已有该 SKU 时只累加数量、不占新坑，故不计入闸门
        // （并发窗口内微小越界可容忍：非资金安全线，唯一索引才是硬兜底）
        if (items.findByBuyerAndSku(buyerId, skuId).isEmpty()) {
            if (items.countByBuyer(buyerId) >= CartRules.ITEM_KINDS_MAX) {
                throw BusinessException.badRequestWithParams(
                        ErrorCodes.CART_FULL,
                        "购物车最多存放 " + CartRules.ITEM_KINDS_MAX + " 种商品",
                        Map.of("limit", CartRules.ITEM_KINDS_MAX));
            }
        }
        items.upsertMerge(Ids.newId(), buyerId, skuId, quantity, CartRules.LINE_QUANTITY_MAX);
        int merged = items.findByBuyerAndSku(buyerId, skuId).orElseThrow().quantity();
        return new AddedItem(skuId, merged, items.countByBuyer(buyerId));
    }

    /**
     * 整车：展示数据两次只读批查（catalog 可售事实、seller 店名）内存拼装，
     * 禁止跨 schema JOIN、不做 N+1。失效条目 available=false 原样保留置灰。
     */
    @Transactional(readOnly = true)
    public CartView list(UUID buyerId) {
        List<CartItemRow> rows = items.findByBuyer(buyerId);
        if (rows.isEmpty()) {
            return new CartView(List.of());
        }
        List<UUID> skuIds = rows.stream().map(CartItemRow::skuId).distinct().toList();
        Map<UUID, SellableSku> sellable = catalog.findSellableByIds(skuIds);
        List<UUID> shopIds =
                sellable.values().stream().map(SellableSku::shopId).distinct().toList();
        Map<UUID, String> shopNames = shops.namesByIds(shopIds);

        return new CartView(
                rows.stream().map(row -> toLine(row, sellable, shopNames)).toList());
    }

    private static CartLine toLine(CartItemRow row, Map<UUID, SellableSku> sellable, Map<UUID, String> shopNames) {
        SellableSku sku = sellable.get(row.skuId());
        if (sku == null) {
            return new CartLine(
                    row.skuId(),
                    row.quantity(),
                    row.selected(),
                    row.createdAt(),
                    false,
                    CartLine.REASON_UNAVAILABLE,
                    null);
        }
        return new CartLine(
                row.skuId(),
                row.quantity(),
                row.selected(),
                row.createdAt(),
                true,
                null,
                new SkuInfo(
                        sku.spuId(),
                        sku.listingId(),
                        sku.merchantId(),
                        sku.shopId(),
                        shopNames.get(sku.shopId()),
                        sku.title(),
                        sku.imageUrl(),
                        sku.specValuesJson(),
                        sku.price()));
    }

    /** 角标计数：免拉整车 */
    @Transactional(readOnly = true)
    public CartCount count(UUID buyerId) {
        return new CartCount(items.countByBuyer(buyerId), items.countSelected(buyerId));
    }

    /**
     * 改数量：条件更新，0 行（条目刚被删）静默通过——下一次拉整车自然看不见它。
     * 不校验在售：失效条目也允许调数量（置灰时前端通常不给入口，但契约上不拦）。
     */
    @Transactional
    public void updateQuantity(UUID buyerId, UUID skuId, int quantity) {
        items.updateQuantity(buyerId, skuId, quantity);
    }

    /**
     * 勾选集合声明式重设：先整车清，再把传入的置真。单选 / 全选 / 按店选都是同一入口
     * （前端把目标集合传上来），并发双标签页 last-write-wins，对勾选态可接受。
     */
    @Transactional
    public void replaceSelection(UUID buyerId, List<UUID> skuIds) {
        items.clearSelection(buyerId);
        if (!skuIds.isEmpty()) {
            items.markSelected(buyerId, skuIds);
        }
    }

    /** 删一条：硬删，条目谁也不引用（订单做快照）。0 行静默。 */
    @Transactional
    public void remove(UUID buyerId, UUID skuId) {
        items.deleteForBuyer(buyerId, skuId);
    }

    /** 批量删（下单后清勾选、清置灰）。 */
    @Transactional
    public void removeAll(UUID buyerId, List<UUID> skuIds) {
        if (skuIds.isEmpty()) {
            return;
        }
        items.deleteForBuyerIn(buyerId, skuIds);
    }

    /**
     * 游标车并入：与加购同一套 upsert（同 SKU 累加封顶），但<b>不做在售闸门</b>——
     * 并入是搬「曾经想买」，失效商品照收进车、列表页置灰让用户自己删；
     * 加购闸门拦的是「现在就想买」，语义不同。
     *
     * <p>种类上限与加购同一条线：已有种类照常累加，新种类只补到 {@link CartRules#ITEM_KINDS_MAX}，
     * 超出的<b>静默丢弃</b>——merge 的语义是「尽力搬」，丢弃比 400 更符合「失效照收」的姿态。
     * 没有这道闸，登录一次 POST 就能越过防刷线把车灌成任意大。
     */
    @Transactional
    public void merge(UUID buyerId, List<MergeLine> lines) {
        if (lines.isEmpty()) {
            return;
        }
        Set<UUID> inCart = new HashSet<>(items.skuIdsByBuyer(buyerId));
        long kinds = inCart.size();
        for (MergeLine line : lines) {
            boolean known = inCart.contains(line.skuId());
            if (!known && kinds >= CartRules.ITEM_KINDS_MAX) {
                continue;
            }
            items.upsertMerge(Ids.newId(), buyerId, line.skuId(), line.quantity(), CartRules.LINE_QUANTITY_MAX);
            if (!known) {
                inCart.add(line.skuId());
                kinds++;
            }
        }
    }

    /** 并入的一行：来自前端 localStorage 的游标车 */
    public record MergeLine(UUID skuId, int quantity) {}
}
