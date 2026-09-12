package com.shop.platform.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.shop.platform.account.api.AddressSnapshotView;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponAvailabilityView;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.api.CouponReadQuery;
import com.shop.platform.coupon.api.CouponUnavailableReason;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.product.api.ProductView;
import com.shop.platform.product.api.SkuView;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SkuStatus;
import com.shop.platform.shop.api.ShippingQuote;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 结算解析器单测——下单资金链路的大脑：结算行归约（同 SKU 合并、封顶）、可售三道判定（SKU 在售/SPU 上架/库存充足）、
 * 失效归因（UNAVAILABLE vs STOCK_SHORTAGE）、图片回落、按店分组算钱。全 mock 无 DB，分支穷举成本低。
 */
@ExtendWith(MockitoExtension.class)
class CheckoutResolverTest {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private final UUID productId = UUID.randomUUID();

    private final UUID skuId = UUID.randomUUID();

    @Mock
    private com.shop.platform.product.api.ProductReadQuery productReadQuery;

    @Mock
    private com.shop.platform.inventory.api.StockReadQuery stockReadQuery;

    @Mock
    private com.shop.platform.shop.api.ShopReadQuery shopReadQuery;

    @Mock
    private com.shop.platform.account.api.AddressReadQuery addressReadQuery;

    @Mock
    private com.shop.platform.shop.api.ShippingFeeReadQuery shippingFeeReadQuery;

    @Mock
    private CouponReadQuery couponReadQuery;

    private CheckoutResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new CheckoutResolver(
                productReadQuery,
                stockReadQuery,
                shopReadQuery,
                addressReadQuery,
                shippingFeeReadQuery,
                couponReadQuery);
        // 默认无券：绝大多数用例关心的是行解析与运费，券在这里是「不存在」的常态
        lenient()
                .when(couponReadQuery.evaluateForShop(any(), any(), anyLong(), any()))
                .thenReturn(List.of());
    }

    /** 造一张评估好的券：本店、可用、减 discount 分 */
    private static CouponAvailabilityView usableCoupon(UUID couponId, long threshold, long discount) {
        return new CouponAvailabilityView(
                couponId,
                "满减券",
                Money.cny(threshold),
                Money.cny(discount),
                CouponBearer.SELLER,
                OffsetDateTime.now().plusDays(7),
                true,
                null);
    }

    private static List<OrderLineRequest> lines(UUID skuId, int quantity) {
        return List.of(new OrderLineRequest(skuId, quantity));
    }

    private SkuView sku(Long price, SkuStatus status) {
        return new SkuView(skuId, productId, "黑色 S", null, price, 1200L, "CNY", status);
    }

    private ProductView product(ProductStatus status) {
        return new ProductView(productId, shopId, "测试手机", "spu.png", 1000L, 1000L, status);
    }

    private void stubSellable(long price, int available) {
        lenient()
                .when(productReadQuery.skusByIds(anyCollection()))
                .thenReturn(Map.of(skuId, sku(price, SkuStatus.ON_SALE)));
        lenient()
                .when(stockReadQuery.availableBySkuIds(anyCollection()))
                .thenReturn(Map.of(skuId, new StockView(skuId, 10, 0, available)));
        lenient()
                .when(productReadQuery.productsByIds(anyCollection()))
                .thenReturn(Map.of(productId, product(ProductStatus.PUBLISHED)));
    }

    // ---- 结算行归约 ----

    @Test
    void 空结算行_400拒绝() {
        assertThatThrownBy(() -> resolver.resolve(List.of())).isInstanceOfSatisfying(BusinessException.class, ex -> {
            assertThat(ex.getHttpStatus()).isEqualTo(400);
            assertThat(ex.getDetail()).contains("不能为空");
        });
    }

    @Test
    void 同SKU多行合并_件数封顶999() {
        stubSellable(500L, 999);
        var resolved = resolver.resolve(List.of(new OrderLineRequest(skuId, 600), new OrderLineRequest(skuId, 600)));

        // 两行同 SKU 合成一行，超大数量被钳制到单行上限，不炸不溢出
        assertThat(resolved.valid()).hasSize(1);
        assertThat(resolved.valid().getFirst().quantity()).isEqualTo(999);
    }

    // ---- 可售三道判定与失效归因 ----

    @Test
    void 可售_进有效行_SPU主图回落() {
        stubSellable(500L, 5);

        var resolved = resolver.resolve(lines(skuId, 2));

        ValidLine line = resolved.valid().getFirst();
        assertThat(line.price()).isEqualTo(Money.cny(500));
        assertThat(line.image()).isEqualTo("spu.png"); // SKU 图空 → 回落 SPU 主图
        assertThat(line.stock()).isEqualTo(5);
        assertThat(resolved.unavailable()).isEmpty(); // 没有失效行，全进有效行
    }

    @Test
    void SKU缺失或停售_归因UNAVAILABLE() {
        // 整个 SKU 没了（被删）
        when(productReadQuery.skusByIds(anyCollection())).thenReturn(Map.of());

        var resolved = resolver.resolve(lines(skuId, 1));
        assertThat(resolved.unavailable().getFirst().cause())
                .isEqualTo(CheckoutPreview.UnavailableLine.CAUSE_UNAVAILABLE);
    }

    @Test
    void SKU停售_归因UNAVAILABLE() {
        when(productReadQuery.skusByIds(anyCollection()))
                .thenReturn(Map.of(skuId, sku(500L, SkuStatus.DISABLED))); // 停售
        when(productReadQuery.productsByIds(anyCollection()))
                .thenReturn(Map.of(productId, product(ProductStatus.PUBLISHED)));

        var resolved = resolver.resolve(lines(skuId, 1));
        assertThat(resolved.unavailable().getFirst().cause())
                .isEqualTo(CheckoutPreview.UnavailableLine.CAUSE_UNAVAILABLE);
    }

    @Test
    void SPU下架_归因UNAVAILABLE() {
        when(productReadQuery.skusByIds(anyCollection())).thenReturn(Map.of(skuId, sku(500L, SkuStatus.ON_SALE)));
        when(productReadQuery.productsByIds(anyCollection()))
                .thenReturn(Map.of(productId, product(ProductStatus.WAREHOUSE))); // 下架

        var resolved = resolver.resolve(lines(skuId, 1));
        assertThat(resolved.unavailable().getFirst().cause())
                .isEqualTo(CheckoutPreview.UnavailableLine.CAUSE_UNAVAILABLE);
    }

    @Test
    void 库存不足_归因STOCK_SHORTAGE() {
        stubSellable(500L, 1); // 只有 1 件

        var resolved = resolver.resolve(lines(skuId, 2));
        assertThat(resolved.unavailable().getFirst().cause())
                .isEqualTo(CheckoutPreview.UnavailableLine.CAUSE_STOCK_SHORTAGE);
        assertThat(resolved.valid()).isEmpty();
    }

    @Test
    void 库存投影缺席_按零库存处理() {
        when(productReadQuery.skusByIds(anyCollection())).thenReturn(Map.of(skuId, sku(500L, SkuStatus.ON_SALE)));
        when(productReadQuery.productsByIds(anyCollection()))
                .thenReturn(Map.of(productId, product(ProductStatus.PUBLISHED)));
        when(stockReadQuery.availableBySkuIds(anyCollection())).thenReturn(Map.of());

        var resolved = resolver.resolve(lines(skuId, 1));
        assertThat(resolved.unavailable().getFirst().cause())
                .isEqualTo(CheckoutPreview.UnavailableLine.CAUSE_STOCK_SHORTAGE);
    }

    // ---- 分组算钱 ----

    @Test
    void 按店分组_金额为行小计之和_未选地址时运费预告零() {
        Money p1 = Money.cny(1000);
        Money p2 = Money.cny(250);
        ValidLine a = new ValidLine(UUID.randomUUID(), productId, shopA(), "A", null, p1, null, 2, 9);
        ValidLine b = new ValidLine(UUID.randomUUID(), productId, shopA(), "B", null, p2, null, 1, 9);
        ValidLine c = new ValidLine(UUID.randomUUID(), productId, shopB(), "C", null, p2, null, 4, 9);

        when(shopReadQuery.namesByIds(any())).thenReturn(Map.of(shopA(), "甲店", shopB(), "乙店"));

        List<CheckoutPreview.Group> groups =
                resolver.groupByShop(new ArrayList<>(List.of(a, b, c)), null, userId, null);

        // 分组按 shopId 升序（与 OrderService.create 拆单顺序一致），但 shopId 是随机 UUID——
        // 谁排前仅由 UUID 大小决定，所以按 shopId 取组、不按下标假定哪家在前
        assertThat(groups).hasSize(2);
        assertThat(groups.stream().map(CheckoutPreview.Group::shopId)).isSorted();

        CheckoutPreview.Group groupA = groupOf(groups, shopA());
        assertThat(groupA.shopName()).isEqualTo("甲店");
        assertThat(groupA.itemAmount()).isEqualTo(Money.cny(2250)); // 1000×2 + 250×1
        // 地址未选 = 地区未知：算不出运费，只预告 0（下单必须走真实地址那一路）
        assertThat(groupA.shippingFee()).isEqualTo(Money.cny(0));
        assertThat(groupA.payAmount()).isEqualTo(Money.cny(2250));
        assertThat(groupOf(groups, shopB()).itemAmount()).isEqualTo(Money.cny(1000)); // 250×4
    }

    @Test
    void 有地址_运费入应付并与报价一致() {
        ValidLine a = new ValidLine(UUID.randomUUID(), productId, shopA(), "A", null, Money.cny(1000), null, 2, 9);
        when(shopReadQuery.namesByIds(any())).thenReturn(Map.of(shopA(), "甲店"));
        when(shippingFeeReadQuery.quote(shopA(), "440305", 2, Money.cny(2000)))
                .thenReturn(new ShippingQuote(templateId, true, Money.cny(800)));

        List<CheckoutPreview.Group> groups = resolver.groupByShop(List.of(a), snapshot("440305"), userId, null);

        CheckoutPreview.Group group = groupOf(groups, shopA());
        assertThat(group.shippingFee()).isEqualTo(Money.cny(800));
        assertThat(group.payAmount()).isEqualTo(Money.cny(2800)); // 商品 2000 + 运费 800
        assertThat(group.deliverable()).isTrue();
        assertThat(group.shippingTemplateId()).isEqualTo(templateId);
    }

    @Test
    void 不配送地区_分组标记不可达且运费零() {
        ValidLine a = new ValidLine(UUID.randomUUID(), productId, shopA(), "A", null, Money.cny(1000), null, 1, 9);
        when(shopReadQuery.namesByIds(any())).thenReturn(Map.of(shopA(), "甲店"));
        when(shippingFeeReadQuery.quote(any(), any(), anyInt(), any()))
                .thenReturn(new ShippingQuote(templateId, false, Money.cny(0)));

        CheckoutPreview.Group group =
                groupOf(resolver.groupByShop(List.of(a), snapshot("653101"), userId, null), shopA());

        assertThat(group.deliverable()).isFalse();
        assertThat(group.shippingFee()).isEqualTo(Money.cny(0));
    }

    // ---- 券接入结算链路 ----

    @Test
    void 用券_应付减券额_且券信息随分组带出() {
        UUID couponId = UUID.randomUUID();
        ValidLine a = new ValidLine(UUID.randomUUID(), productId, shopA(), "A", null, Money.cny(1000), null, 2, 9);
        when(shopReadQuery.namesByIds(any())).thenReturn(Map.of(shopA(), "甲店"));
        when(couponReadQuery.evaluateForShop(userId, shopA(), 2000L, "CNY"))
                .thenReturn(List.of(usableCoupon(couponId, 1500L, 300L)));

        CheckoutPreview.Group group =
                groupOf(resolver.groupByShop(List.of(a), null, userId, List.of(couponId)), shopA());

        assertThat(group.discountAmount()).isEqualTo(Money.cny(300));
        assertThat(group.payAmount()).isEqualTo(Money.cny(1700)); // 2000 − 300
        assertThat(group.appliedCoupon().userCouponId()).isEqualTo(couponId);
        assertThat(group.coupons()).hasSize(1); // 候选一并带出，供结算页渲染选券区
    }

    @Test
    void 用券_门槛基数不含运费_运费照收且不参与打折() {
        UUID couponId = UUID.randomUUID();
        ValidLine a = new ValidLine(UUID.randomUUID(), productId, shopA(), "A", null, Money.cny(1000), null, 1, 9);
        when(shopReadQuery.namesByIds(any())).thenReturn(Map.of(shopA(), "甲店"));
        // 券按商品额 1000（而不是 1000+800）判定与计算
        when(couponReadQuery.evaluateForShop(userId, shopA(), 1000L, "CNY"))
                .thenReturn(List.of(usableCoupon(couponId, 0L, 200L)));
        when(shippingFeeReadQuery.quote(shopA(), "440305", 1, Money.cny(1000)))
                .thenReturn(new ShippingQuote(templateId, true, Money.cny(800)));

        CheckoutPreview.Group group =
                groupOf(resolver.groupByShop(List.of(a), snapshot("440305"), userId, List.of(couponId)), shopA());

        assertThat(group.shippingFee()).isEqualTo(Money.cny(800)); // 运费不打折
        assertThat(group.payAmount()).isEqualTo(Money.cny(1600)); // 1000 + 800 − 200
    }

    @Test
    void 选了不可用的券_400并说明原因() {
        UUID couponId = UUID.randomUUID();
        ValidLine a = new ValidLine(UUID.randomUUID(), productId, shopA(), "A", null, Money.cny(1000), null, 1, 9);
        when(shopReadQuery.namesByIds(any())).thenReturn(Map.of(shopA(), "甲店"));
        // 未达门槛：券在候选里但 usable=false
        when(couponReadQuery.evaluateForShop(userId, shopA(), 1000L, "CNY"))
                .thenReturn(List.of(new CouponAvailabilityView(
                        couponId,
                        "满 2000 减 300",
                        Money.cny(2000),
                        Money.cny(0),
                        CouponBearer.SELLER,
                        OffsetDateTime.now().plusDays(1),
                        false,
                        CouponUnavailableReason.THRESHOLD_NOT_MET)));

        // 不能静默按「没用券」算：用户会以为券生效了，看到的却是原价
        assertThatThrownBy(() -> resolver.groupByShop(List.of(a), null, userId, List.of(couponId)))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(400);
                    assertThat(ex.getDetail()).contains("满 2000 减 300").contains("门槛");
                });
    }

    @Test
    void 选了不属于本单的券_400拒绝() {
        UUID couponId = UUID.randomUUID();
        ValidLine a = new ValidLine(UUID.randomUUID(), productId, shopA(), "A", null, Money.cny(1000), null, 1, 9);
        when(shopReadQuery.namesByIds(any())).thenReturn(Map.of(shopA(), "甲店"));
        // 本店候选里没有这张券（跨店券 / 已核销 / 非本人）——不能落地就必须拒绝
        when(couponReadQuery.evaluateForShop(userId, shopA(), 1000L, "CNY")).thenReturn(List.of());

        assertThatThrownBy(() -> resolver.groupByShop(List.of(a), null, userId, List.of(couponId)))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(400);
                    assertThat(ex.getDetail()).contains("不可用于本单");
                });
    }

    private final UUID templateId = UUID.randomUUID();

    private static AddressSnapshot snapshot(String regionCode) {
        return new AddressSnapshot("张三", "13800000000", regionCode, "广东省", "深圳市", "南山区", "测试路 1 号");
    }

    private static CheckoutPreview.Group groupOf(List<CheckoutPreview.Group> groups, UUID shopId) {
        return groups.stream()
                .filter(g -> g.shopId().equals(shopId))
                .findFirst()
                .orElseThrow(() -> new AssertionError("未找到店铺分组：" + shopId));
    }

    private final UUID shopB = UUID.randomUUID();

    private UUID shopA() {
        return shopId;
    }

    private UUID shopB() {
        return shopB;
    }

    // ---- 地址快照门 ----

    @Test
    void 地址快照_本人未删才放行() {
        AddressSnapshotView mine =
                new AddressSnapshotView(userId, null, "张三", "13800000000", "110105", "北京市", "北京市", "朝阳区", "测试路 1 号");
        when(addressReadQuery.byId(any())).thenReturn(Optional.of(mine));

        AddressSnapshot snap = resolver.loadAddressSnapshot(userId, UUID.randomUUID());
        assertThat(snap.receiverName()).isEqualTo("张三");
        assertThat(snap.detail()).isEqualTo("测试路 1 号");
    }

    @Test
    void 地址快照_他人地址_404不泄露存在性() {
        AddressSnapshotView foreign =
                new AddressSnapshotView(UUID.randomUUID(), null, "李四", "13900000000", "110105", "x", "x", "x", "x");
        when(addressReadQuery.byId(any())).thenReturn(Optional.of(foreign));

        // 归属不符与不存在同一句话、同一个状态码（404）：对外看不出「这条地址存不存在」
        assertThatThrownBy(() -> resolver.loadAddressSnapshot(userId, UUID.randomUUID()))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(404);
                    assertThat(ex.getDetail()).isEqualTo("收货地址不存在");
                });
    }

    @Test
    void 地址快照_已软删_404() {
        AddressSnapshotView deleted = new AddressSnapshotView(
                userId, OffsetDateTime.now(), "张三", "13800000000", "110105", "x", "x", "x", "x");
        when(addressReadQuery.byId(any())).thenReturn(Optional.of(deleted));

        assertThatThrownBy(() -> resolver.loadAddressSnapshot(userId, UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
    }
}
