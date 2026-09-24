package com.shop.platform.order.service;

import com.shop.platform.account.api.AddressReadQuery;
import com.shop.platform.account.api.AddressSnapshotView;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.Quantities;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponAvailabilityView;
import com.shop.platform.coupon.api.CouponReadQuery;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 结算解析器：把「结算行（skuId + 件数）→ 有效行 + 置灰行 + 按店分组」的整条只读链路
 * 从 OrderService 拆出。跨模块读取全部经各模块 api 包（product / inventory / shop / account / coupon），
 * 不碰他方 schema 的表名与状态魔法值。来源（购物车勾选 / 立即购买）由前端归约，order 不回查购物车。
 */
@Component
@RequiredArgsConstructor
class CheckoutResolver {

    private final ProductReadQuery productReadQuery;

    private final StockReadQuery stockReadQuery;

    private final ShopReadQuery shopReadQuery;

    private final AddressReadQuery addressReadQuery;

    /** 运费报价（shop :: api）：模板与计费规则属店铺，本模块只提供订单侧事实并消费结果 */
    private final ShippingFeeReadQuery shippingFeeReadQuery;

    /** 券可用性判定与减免额（coupon :: api）：券规则属 coupon 模块，本模块只提供订单侧事实并消费结果 */
    private final CouponReadQuery couponReadQuery;

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
                    sku.price(),
                    sku.originalPrice(),
                    line.quantity(),
                    available,
                    product.sevenDayReturn()));
        }
        return new ResolvedCheckout(valid, unavailable);
    }

    /** 阶段一：结算行归约——同 SKU 合并件数并封顶（{@link Quantities#LINE_QUANTITY_MAX}，与加购累加同一档）；空集合 400（HTTP 层 @NotEmpty 先拦，这里兜 service 直调） */
    private static List<RequestedLine> requestedLines(List<OrderLineRequest> lines) {
        Validate.isTrue(lines != null && !lines.isEmpty(), "结算条目不能为空");
        Map<UUID, Integer> merged = new LinkedHashMap<>();
        for (OrderLineRequest line : lines) {
            merged.merge(line.skuId(), line.quantity(), (a, b) -> Math.min(a + b, Quantities.LINE_QUANTITY_MAX));
        }
        return merged.entrySet().stream()
                .map(e -> new RequestedLine(e.getKey(), e.getValue()))
                .toList();
    }

    /** 有效行按店铺分组算钱；店铺名经 shop :: api 只读拼装（一组对应一笔待创建订单）。
     *  分组按 shopId 升序，与 OrderService.create 的拆单顺序一致（那边是为锁序），预览与实际成单同序。
     *
     * <p>运费也在这里定格，且与订单落库同源（预览与下单走同一个方法）：一个店铺一份模板一份运费，
     * 口径是<b>同店合计</b>（件数/商品额）而不是按行 —— 首件+续件的「件数」是整单的件数。
     *
     * <p>优惠券同样在这条链路上定格，理由也一样：<b>预览与下单必须共用同一次计算</b>，
     * 「预览一个价、下单另一个价」是最经典的客诉来源。两条与券有关的定案：
     * <ul>
     *   <li>门槛基数 = <b>同店商品额</b>（不含运费、不含其他优惠）；
     *   <li>包邮门槛仍按<b>优惠前</b>商品额判定 —— 运费先算、券后减，用户用了券不会反而丢掉包邮。
     * </ul>
     *
     * <p>{@code address} 可为 null（预览允许未选地址）：地区未知就算不出运费，此时只预告 0，
     * 下单走 create 的真实地址路径，不允许拿这份预告当成交口径。
     *
     * @param selectedCouponIds 买家选中的券（可为空）。必须都能在本单落地：选了却不可用、或压根不属于本单任何一家店，
     *     都当场 400 而不是静默忽略 —— 静默忽略会让用户以为券生效了，看到的价却是原价。
     */
    List<CheckoutPreview.Group> groupByShop(
            List<ValidLine> valid, AddressSnapshot address, UUID userId, List<UUID> selectedCouponIds) {
        Map<UUID, List<ValidLine>> byShop =
                valid.stream().collect(Collectors.groupingBy(ValidLine::shopId, TreeMap::new, Collectors.toList()));
        Map<UUID, String> shopNames = shopReadQuery.namesByIds(byShop.keySet());

        // CopyOf 顺带去重：同一张券传两次也只该用一次
        Set<UUID> selected = selectedCouponIds == null ? Set.of() : Set.copyOf(selectedCouponIds);
        Set<UUID> landed = new HashSet<>();
        List<CheckoutPreview.Group> groups = new ArrayList<>();

        for (Map.Entry<UUID, List<ValidLine>> entry : byShop.entrySet()) {
            UUID shopId = entry.getKey();
            List<ValidLine> lines = entry.getValue();
            Money itemAmount = sumLines(lines);
            int quantity = lines.stream().mapToInt(ValidLine::quantity).sum();

            // 1. 本店券评估（含不可用者的原因码）：门槛基数是同店商品额
            List<CouponAvailabilityView> coupons = couponReadQuery.evaluateForShop(userId, shopId, itemAmount);

            // 2. 挑出买家在本店选的那张：选了却不可用要当场说明原因。
            //    刻意写成 if + throw 而不是 Validate.isTrue(...)：后者的文案参数会被即时求值，
            //    对「可用」的券来说 unavailableReason() 是 null，取 message() 会直接 NPE
            CouponAvailabilityView appliedCoupon = null;
            for (CouponAvailabilityView candidate : coupons) {
                if (!selected.contains(candidate.userCouponId())) {
                    continue;
                }
                if (!candidate.usable()) {
                    throw BusinessException.badRequest("优惠券「" + candidate.name() + "」不可用："
                            + candidate.unavailableReason().message());
                }
                appliedCoupon = candidate;
                landed.add(candidate.userCouponId());
                break;
            }

            // 3. 运费按优惠前商品额与件数报价（包邮门槛不看优惠）
            ShippingQuote quote = address == null
                    ? null
                    : shippingFeeReadQuery.quote(shopId, address.regionCode(), quantity, itemAmount);
            Money shippingFee = quote == null ? Money.zero(itemAmount.currency()) : quote.shippingFee();

            // 4. 金额定型：应付 = 商品 + 运费 − 券（与 orders 表的 CHECK 同口径，落地与预览同源）
            Money discountAmount = appliedCoupon == null ? Money.zero(itemAmount.currency()) : appliedCoupon.discount();
            groups.add(new CheckoutPreview.Group(
                    shopId,
                    shopNames.get(shopId),
                    lines,
                    itemAmount,
                    shippingFee,
                    discountAmount,
                    itemAmount.plus(shippingFee).minus(discountAmount),
                    quote == null || quote.deliverable(),
                    quote == null ? null : quote.templateId(),
                    appliedCoupon,
                    coupons));
        }

        // 5. 选中的券必须全部落地：没落地说明它不属于本单任何一家店，或已被占用/使用/过期（不在候选里）
        Validate.isTrue(selected.size() == landed.size(), "所选优惠券不可用于本单，请重新选择");
        return groups;
    }

    Money sumLines(List<ValidLine> lines) {
        // 求和起点取行上的币种（同店同行的单子同币种，跨币种在 plus 里就挡了），不替平台预设 CNY
        String currency = lines.isEmpty() ? Money.CNY : lines.get(0).price().currency();
        return lines.stream().map(l -> l.price().times(l.quantity())).reduce(Money.zero(currency), Money::plus);
    }

    /** 地址快照来源（account :: api）：归属本人且未删除，否则 404（预览与创建共用一道门） */
    AddressSnapshot loadAddressSnapshot(UUID userId, UUID addressId) {
        AddressSnapshotView row =
                Validate.presentOwned(addressReadQuery.byId(addressId), AddressSnapshotView::userId, userId, "收货地址不存在");
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

    // 内部投影 record：结算链路上的一站一形状，仅在本包内流通
    /** 结算请求行：同 SKU 合并后的 skuId + 件数 */
    record RequestedLine(UUID skuId, int quantity) {}

    record ResolvedCheckout(List<ValidLine> valid, List<CheckoutPreview.UnavailableLine> unavailable) {}
}
