package com.shop.platform.order.service;

import com.shop.platform.cart.api.CartLineView;
import com.shop.platform.cart.api.CartReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.product.api.ProductReadQuery;
import com.shop.platform.product.api.ProductView;
import com.shop.platform.product.api.SkuView;
import com.shop.platform.shop.api.ShopReadQuery;
import com.shop.platform.user.api.AddressReadQuery;
import com.shop.platform.user.api.AddressSnapshotView;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 结算解析器：把「购物车条目/立即购买参数 → 有效行 + 置灰行 + 按店分组」的整条只读链路
 * 从 OrderService 拆出。跨模块读取全部经各模块 api 包（product / shop / user / cart），
 * 不碰他方 schema 的表名与状态魔法值。
 */
@Component
@RequiredArgsConstructor
class CheckoutResolver {

    /** 单行购买数量上限，与 cart.items 的 CHECK 同值兜底 */
    private static final int MAX_QUANTITY_PER_LINE = 999;

    private final ProductReadQuery productReadQuery;

    private final ShopReadQuery shopReadQuery;

    private final AddressReadQuery addressReadQuery;

    private final CartReadQuery cartReadQuery;

    /**
     * 结算条目解析：购物车模式从 cart 模块点查自己的条目（内存过滤归属），立即购买模式直接用请求参数；
     * 再对 product 做「SKU 在售 + SPU 上架 + 库存充足」三道判定，产出有效行与置灰行。
     */
    ResolvedCheckout resolve(UUID userId, List<UUID> cartItemIds, UUID buySkuId, Integer buyQuantity) {
        // 1. 组装请求行：来源二选一，立即购买数量封顶
        List<RequestedLine> requested = requestedLines(userId, cartItemIds, buySkuId, buyQuantity);

        // 2. 批量拉 SKU / SPU 投影（product :: api 按 ID 只读点查，禁止 JOIN）
        List<UUID> skuIds =
                requested.stream().map(RequestedLine::skuId).distinct().toList();
        Map<UUID, SkuView> skus = productReadQuery.skusByIds(skuIds);
        Map<UUID, ProductView> products = productReadQuery.productsByIds(
                skus.values().stream().map(SkuView::productId).distinct().toList());

        // 3. 逐行三道判定分类：缺失/停售/下架 → UNAVAILABLE；在售但库存不足 → STOCK_SHORTAGE；否则进有效行
        List<ValidLine> valid = new ArrayList<>();
        List<CheckoutPreview.UnavailableLine> unavailable = new ArrayList<>();
        for (RequestedLine line : requested) {
            SkuView sku = skus.get(line.skuId());
            boolean onSale = sku != null && sku.onSale() && products.containsKey(sku.productId());
            if (!onSale) {
                unavailable.add(unavailableLine(line, sku, CheckoutPreview.UnavailableLine.CAUSE_UNAVAILABLE));
                continue;
            }
            ProductView product = products.get(sku.productId());
            if (!product.published()) {
                unavailable.add(unavailableLine(line, sku, CheckoutPreview.UnavailableLine.CAUSE_UNAVAILABLE));
                continue;
            }
            if (sku.stock() == null || sku.stock() < line.quantity()) {
                unavailable.add(unavailableLine(line, sku, CheckoutPreview.UnavailableLine.CAUSE_STOCK_SHORTAGE));
                continue;
            }
            // 图片解析在此定型：SKU 图空则回落 SPU 主图，落库即终值，读端零逻辑；金额在此定型为 Money
            valid.add(new ValidLine(
                    line.skuId(),
                    sku.productId(),
                    product.shopId(),
                    sku.name(),
                    sku.image() != null ? sku.image() : product.mainImage(),
                    Money.ofFen(sku.price(), sku.currency()),
                    sku.originalPrice() != null ? Money.ofFen(sku.originalPrice(), sku.currency()) : null,
                    line.quantity(),
                    sku.stock()));
        }
        // 总额口径与分组小计（sumLines）同源，不会漂移
        return new ResolvedCheckout(valid, unavailable, sumLines(valid));
    }

    /** 阶段一：来源二选一组装请求行；购物车条目按 ID 点查后内存过滤归属，他车 ID 静默忽略（不泄露他车内容） */
    private List<RequestedLine> requestedLines(
            UUID userId, List<UUID> cartItemIds, UUID buySkuId, Integer buyQuantity) {
        boolean cartMode = cartItemIds != null && !cartItemIds.isEmpty();
        boolean buyMode = buySkuId != null;
        Validate.isTrue(cartMode ^ buyMode, "购物车结算与立即购买只能二选一");
        Validate.isTrue(!buyMode || (buyQuantity != null && buyQuantity >= 1), "购买数量至少 1 件");

        List<RequestedLine> requested = new ArrayList<>();
        if (buyMode) {
            requested.add(new RequestedLine(buySkuId, Math.min(buyQuantity, MAX_QUANTITY_PER_LINE), null));
        } else {
            LinkedHashSet<UUID> ids = new LinkedHashSet<>(cartItemIds);
            Map<UUID, CartLineView> rows = cartReadQuery.linesByIds(ids);
            for (UUID id : ids) {
                CartLineView row = rows.get(id);
                if (row != null && row.userId().equals(userId)) {
                    requested.add(new RequestedLine(row.skuId(), row.quantity(), id));
                }
            }
            Validate.isTrue(!requested.isEmpty(), "结算条目不存在或已被处理");
        }
        return requested;
    }

    /** 有效行按店铺分组算钱；店铺名经 shop :: api 只读拼装（一组对应一笔待创建订单） */
    List<CheckoutPreview.Group> groupByShop(List<ValidLine> valid) {
        Map<UUID, List<ValidLine>> byShop = valid.stream()
                .collect(Collectors.groupingBy(ValidLine::shopId, LinkedHashMap::new, Collectors.toList()));
        Map<UUID, String> shopNames = shopReadQuery.namesByIds(byShop.keySet());
        return byShop.entrySet().stream()
                .map(e -> {
                    List<CheckoutPreview.Line> lines =
                            e.getValue().stream().map(this::toPreviewLine).toList();
                    Money itemAmount = sumLines(e.getValue());
                    return new CheckoutPreview.Group(
                            e.getKey(), shopNames.get(e.getKey()), lines, itemAmount, Money.cny(0), itemAmount);
                })
                .toList();
    }

    private CheckoutPreview.Line toPreviewLine(ValidLine l) {
        return new CheckoutPreview.Line(
                l.skuId(), l.productId(), l.name(), l.image(), l.price(), l.originalPrice(), l.quantity(), l.stock());
    }

    Money sumLines(List<ValidLine> lines) {
        return lines.stream().map(l -> l.price().times(l.quantity())).reduce(Money.cny(0), Money::plus);
    }

    /** 地址快照来源（user :: api）：归属本人且未删除，否则 404（预览与创建共用一道门） */
    AddressSnapshot loadAddressSnapshot(UUID userId, UUID addressId) {
        AddressSnapshotView row =
                addressReadQuery.byId(addressId).orElseThrow(() -> BusinessException.notFound("收货地址不存在"));
        Validate.isTrue(row.userId().equals(userId), "收货地址不存在");
        Validate.isTrue(row.deletedAt() == null, "收货地址不存在");
        return new AddressSnapshot(
                row.receiverName(), row.phone(), row.province(), row.city(), row.district(), row.detail());
    }

    private static CheckoutPreview.UnavailableLine unavailableLine(RequestedLine line, SkuView sku, String cause) {
        return new CheckoutPreview.UnavailableLine(
                line.skuId(),
                sku != null ? sku.name() : null,
                sku != null ? sku.image() : null,
                line.quantity(),
                cause);
    }

    // ---- 内部投影 record：结算链路上的一站一形状，仅在本包内流通 ----

    /** 结算请求行：立即购买时 cartItemId 为 null */
    record RequestedLine(UUID skuId, int quantity, UUID cartItemId) {}

    /** 三道判定通过后的有效行：携带分组所需 shopId 与全部快照字段；价格在入口已定型为 Money */
    record ValidLine(
            UUID skuId,
            UUID productId,
            UUID shopId,
            String name,
            String image,
            Money price,
            Money originalPrice,
            int quantity,
            int stock) {}

    record ResolvedCheckout(
            List<ValidLine> valid, List<CheckoutPreview.UnavailableLine> unavailable, Money totalPayAmount) {}
}
