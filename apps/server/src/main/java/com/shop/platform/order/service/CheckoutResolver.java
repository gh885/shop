package com.shop.platform.order.service;

import com.shop.platform.account.api.AddressReadQuery;
import com.shop.platform.account.api.AddressSnapshotView;
import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.product.api.ProductReadQuery;
import com.shop.platform.product.api.ProductView;
import com.shop.platform.product.api.SkuView;
import com.shop.platform.shop.api.ShippingFeeReadQuery;
import com.shop.platform.shop.api.ShippingQuote;
import com.shop.platform.shop.api.ShopReadQuery;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 结算解析器：把「结算行（skuId + 件数）→ 有效行 + 置灰行 + 按店分组」的整条只读链路
 * 从 OrderService 拆出。跨模块读取全部经各模块 api 包（product / inventory / shop / account），
 * 不碰他方 schema 的表名与状态魔法值。来源（购物车勾选 / 立即购买）由前端归约，order 不回查购物车。
 */
@Component
@RequiredArgsConstructor
class CheckoutResolver {

    /** 单行购买数量上限，与 cart.items 的 CHECK 同值兜底（同 SKU 多行合并后封顶） */
    private static final int MAX_QUANTITY_PER_LINE = 999;

    private final ProductReadQuery productReadQuery;

    private final StockReadQuery stockReadQuery;

    private final ShopReadQuery shopReadQuery;

    private final AddressReadQuery addressReadQuery;

    /** 运费报价（shop :: api）：模板与计费规则属店铺，本模块只提供订单侧事实并消费结果 */
    private final ShippingFeeReadQuery shippingFeeReadQuery;

    /**
     * 结算行解析：同 SKU 多行先合并；再对 product 做「SKU 在售 + SPU 上架 + 库存充足」三道判定，
     * 产出有效行与置灰行。
     */
    ResolvedCheckout resolve(List<OrderLineRequest> lines) {
        // 1. 组装请求行：同 SKU 合并件数并封顶
        List<RequestedLine> requested = requestedLines(lines);

        // 2. 批量拉 SKU / SPU / 库存投影（product / inventory :: api 按 ID 只读点查，禁止 JOIN）
        List<UUID> skuIds = requested.stream().map(RequestedLine::skuId).toList();
        Map<UUID, SkuView> skus = productReadQuery.skusByIds(skuIds);
        Map<UUID, StockView> stocks = stockReadQuery.availableBySkuIds(skuIds);
        Map<UUID, ProductView> products = productReadQuery.productsByIds(
                skus.values().stream().map(SkuView::productId).distinct().toList());

        // 3. 逐行判定分类：缺失/停售/下架 → UNAVAILABLE；在售但库存不足 → STOCK_SHORTAGE；否则进有效行
        List<ValidLine> valid = new ArrayList<>();
        List<CheckoutPreview.UnavailableLine> unavailable = new ArrayList<>();
        for (RequestedLine line : requested) {
            SkuView sku = skus.get(line.skuId());
            ProductView product = sku == null ? null : products.get(sku.productId());
            boolean sellable = sku != null && sku.onSale() && product != null && product.published();
            if (!sellable) {
                unavailable.add(unavailableLine(line, sku, CheckoutPreview.UnavailableLine.CAUSE_UNAVAILABLE));
                continue;
            }
            int available = stocks.get(line.skuId()) == null
                    ? 0
                    : stocks.get(line.skuId()).availableStock();
            if (available < line.quantity()) {
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
                    Money.ofFenOrNull(sku.originalPrice(), sku.currency()),
                    line.quantity(),
                    available));
        }
        return new ResolvedCheckout(valid, unavailable);
    }

    /** 阶段一：结算行归约——同 SKU 合并件数并封顶；空集合 400（HTTP 层 @NotEmpty 先拦，这里兜 service 直调） */
    private static List<RequestedLine> requestedLines(List<OrderLineRequest> lines) {
        Validate.isTrue(lines != null && !lines.isEmpty(), "结算条目不能为空");
        Map<UUID, Integer> merged = new LinkedHashMap<>();
        for (OrderLineRequest line : lines) {
            merged.merge(line.skuId(), line.quantity(), (a, b) -> Math.min(a + b, MAX_QUANTITY_PER_LINE));
        }
        return merged.entrySet().stream()
                .map(e -> new RequestedLine(e.getKey(), e.getValue()))
                .toList();
    }

    /** 有效行按店铺分组算钱；店铺名经 shop :: api 只读拼装（一组对应一笔待创建订单）。
     *  分组按 shopId 升序，与 OrderService.create 的拆单顺序一致（那边是为锁序，见其第 3 步注释），预览与实际成单同序。
     *
     * <p>运费也在这里定格，且与订单落库同源（预览与下单走同一个方法）：一个店铺一份模板一份运费，
     * 口径是<b>同店合计</b>（件数/商品额）而不是按行 —— 首件+续件的「件数」是整单的件数。
     *
     * <p>{@code address} 可为 null（预览允许未选地址）：地区未知就算不出运费，此时只预告 0，
     * 下单走 create 的真实地址路径，不允许拿这份预告当成交口径。
     */
    List<CheckoutPreview.Group> groupByShop(List<ValidLine> valid, AddressSnapshot address) {
        Map<UUID, List<ValidLine>> byShop =
                valid.stream().collect(Collectors.groupingBy(ValidLine::shopId, TreeMap::new, Collectors.toList()));
        Map<UUID, String> shopNames = shopReadQuery.namesByIds(byShop.keySet());
        return byShop.entrySet().stream()
                .map(e -> {
                    Money itemAmount = sumLines(e.getValue());
                    int quantity =
                            e.getValue().stream().mapToInt(ValidLine::quantity).sum();
                    ShippingQuote quote = address == null
                            ? null
                            : shippingFeeReadQuery.quote(e.getKey(), address.regionCode(), quantity, itemAmount);
                    return new CheckoutPreview.Group(
                            e.getKey(),
                            shopNames.get(e.getKey()),
                            e.getValue(),
                            itemAmount,
                            quote == null ? Money.ofFen(0, itemAmount.currency()) : quote.shippingFee(),
                            quote == null ? itemAmount : itemAmount.plus(quote.shippingFee()),
                            quote == null || quote.deliverable(),
                            quote == null ? null : quote.templateId());
                })
                .toList();
    }

    Money sumLines(List<ValidLine> lines) {
        return lines.stream().map(l -> l.price().times(l.quantity())).reduce(Money.cny(0), Money::plus);
    }

    /** 地址快照来源（account :: api）：归属本人且未删除，否则 404（预览与创建共用一道门） */
    AddressSnapshot loadAddressSnapshot(UUID userId, UUID addressId) {
        AddressSnapshotView row = Validate.present(addressReadQuery.byId(addressId), "收货地址不存在");
        Validate.isTrue(row.userId().equals(userId), 404, "收货地址不存在");
        Validate.isTrue(row.deletedAt() == null, 404, "收货地址不存在");
        return new AddressSnapshot(
                row.receiverName(),
                row.phone(),
                row.regionCode(),
                row.province(),
                row.city(),
                row.district(),
                row.detail());
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

    /** 结算请求行：同 SKU 合并后的 skuId + 件数 */
    record RequestedLine(UUID skuId, int quantity) {}

    record ResolvedCheckout(List<ValidLine> valid, List<CheckoutPreview.UnavailableLine> unavailable) {}
}
