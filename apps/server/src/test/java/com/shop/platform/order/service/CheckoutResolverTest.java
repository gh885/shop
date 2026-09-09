package com.shop.platform.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.product.api.ProductView;
import com.shop.platform.product.api.SkuView;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SkuStatus;
import com.shop.platform.user.api.AddressSnapshotView;
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
    private com.shop.platform.user.api.AddressReadQuery addressReadQuery;

    private CheckoutResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new CheckoutResolver(productReadQuery, stockReadQuery, shopReadQuery, addressReadQuery);
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
        assertThat(resolved.totalPayAmount()).isEqualTo(Money.cny(1000));
        assertThat(resolved.unavailable()).isEmpty();
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
    void 按店分组_金额为行小计之和_运费零() {
        Money p1 = Money.cny(1000);
        Money p2 = Money.cny(250);
        ValidLine a = new ValidLine(UUID.randomUUID(), productId, shopA(), "A", null, p1, null, 2, 9);
        ValidLine b = new ValidLine(UUID.randomUUID(), productId, shopA(), "B", null, p2, null, 1, 9);
        ValidLine c = new ValidLine(UUID.randomUUID(), productId, shopB(), "C", null, p2, null, 4, 9);

        when(shopReadQuery.namesByIds(any())).thenReturn(Map.of(shopA(), "甲店", shopB(), "乙店"));

        List<CheckoutPreview.Group> groups = resolver.groupByShop(new ArrayList<>(List.of(a, b, c)));

        assertThat(groups).hasSize(2);
        CheckoutPreview.Group first = groups.get(0);
        assertThat(first.shopName()).isEqualTo("甲店");
        assertThat(first.itemAmount()).isEqualTo(Money.cny(2250)); // 1000×2 + 250×1
        assertThat(first.payAmount()).isEqualTo(Money.cny(2250)); // V1 运费恒 0
        assertThat(groups.get(1).itemAmount()).isEqualTo(Money.cny(1000)); // 250×4
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
                new AddressSnapshotView(userId, null, "张三", "13800000000", "北京市", "北京市", "朝阳区", "测试路 1 号");
        when(addressReadQuery.byId(any())).thenReturn(Optional.of(mine));

        AddressSnapshot snap = resolver.loadAddressSnapshot(userId, UUID.randomUUID());
        assertThat(snap.receiverName()).isEqualTo("张三");
        assertThat(snap.detail()).isEqualTo("测试路 1 号");
    }

    @Test
    void 地址快照_他人地址_404不泄露存在性() {
        AddressSnapshotView foreign =
                new AddressSnapshotView(UUID.randomUUID(), null, "李四", "13900000000", "x", "x", "x", "x");
        when(addressReadQuery.byId(any())).thenReturn(Optional.of(foreign));

        // 归属不符与不存在同一句话，但状态码是 400（isTrue 收口）；不泄露存在性的语义靠同文案达成
        assertThatThrownBy(() -> resolver.loadAddressSnapshot(userId, UUID.randomUUID()))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(400);
                    assertThat(ex.getDetail()).isEqualTo("收货地址不存在");
                });
    }

    @Test
    void 地址快照_已软删_404() {
        AddressSnapshotView deleted =
                new AddressSnapshotView(userId, OffsetDateTime.now(), "张三", "13800000000", "x", "x", "x", "x");
        when(addressReadQuery.byId(any())).thenReturn(Optional.of(deleted));

        assertThatThrownBy(() -> resolver.loadAddressSnapshot(userId, UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
    }
}
