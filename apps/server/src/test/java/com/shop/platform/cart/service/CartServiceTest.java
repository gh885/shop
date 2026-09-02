package com.shop.platform.cart.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.mapper.CartItem;
import com.shop.platform.common.BusinessException;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.product.api.ProductReadQuery;
import com.shop.platform.product.api.ProductView;
import com.shop.platform.product.api.SkuView;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SkuStatus;
import com.shop.platform.shop.api.ShopReadQuery;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 加购业务单测：可加购判定（SKU 在售 + SPU 上架）、条目数防刷、以及「已在车里的 SKU 不占新坑」。
 *
 * <p>同 SKU 累加与封顶 999 现在是 upsert 单语句的 DB 侧语义（{@code CartItemMapper#upsertMerging}
 * 的 ON CONFLICT DO UPDATE），mock 掉 mapper 就测不到，改由真库链路的控制器测试 / IT 覆盖。
 */
@ExtendWith(MockitoExtension.class)
class CartServiceTest {

    private final UUID userId = UUID.randomUUID();

    private final UUID skuId = UUID.randomUUID();

    private final UUID productId = UUID.randomUUID();

    @Mock
    private com.shop.platform.cart.mapper.CartItemMapper cartItemMapper;

    @Mock
    private ProductReadQuery productReadQuery;

    @Mock
    private StockReadQuery stockReadQuery;

    @Mock
    private ShopReadQuery shopReadQuery;

    @InjectMocks
    private CartService service;

    private AddCartItemRequest request(int quantity) {
        return new AddCartItemRequest(skuId, quantity);
    }

    /** SKU 在售 + SPU 上架的可购组合 */
    private void stubSellable() {
        when(productReadQuery.skuById(skuId))
                .thenReturn(Optional.of(
                        new SkuView(skuId, productId, "黑色 S", null, 1000L, null, "CNY", SkuStatus.ON_SALE)));
        when(productReadQuery.productById(productId))
                .thenReturn(Optional.of(new ProductView(
                        productId, UUID.randomUUID(), "测试手机", null, null, null, ProductStatus.PUBLISHED)));
    }

    @Test
    void 新条目_默认勾选() {
        stubSellable();
        when(cartItemMapper.selectByUserAndSku(userId, skuId)).thenReturn(null);
        when(cartItemMapper.countByUser(userId)).thenReturn(0L);
        when(cartItemMapper.upsertMerging(userId, skuId, 2))
                .thenReturn(CartItem.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .skuId(skuId)
                        .quantity(2)
                        .selected(true)
                        .build());

        CartItem item = service.add(userId, request(2));

        assertThat(item.getQuantity()).isEqualTo(2);
        assertThat(item.getSelected()).isTrue();
    }

    @Test
    void 同SKU已在车_不占新坑_跳过条目数闸门() {
        stubSellable();
        CartItem existing = CartItem.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .skuId(skuId)
                .quantity(3)
                .selected(true)
                .build();
        when(cartItemMapper.selectByUserAndSku(userId, skuId)).thenReturn(existing);
        // 累加由 upsert 在 DB 侧完成，service 只透传落库后的整行
        when(cartItemMapper.upsertMerging(userId, skuId, 2))
                .thenReturn(CartItem.builder()
                        .id(existing.getId())
                        .userId(userId)
                        .skuId(skuId)
                        .quantity(5)
                        .selected(true)
                        .build());

        CartItem merged = service.add(userId, request(2));

        assertThat(merged.getSkuId()).isEqualTo(skuId);
        assertThat(merged.getQuantity()).isEqualTo(5);
        // 已在车里只累加数量，不新占条目坑 → 不查条目数
        verify(cartItemMapper, never()).countByUser(userId);
    }

    @Test
    void SKU停售或不存在_400拒收() {
        when(productReadQuery.skuById(skuId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.add(userId, request(1)))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(400));
    }

    @Test
    void SPU已下架_拒收() {
        when(productReadQuery.skuById(skuId))
                .thenReturn(
                        Optional.of(new SkuView(skuId, productId, "x", null, 1000L, null, "CNY", SkuStatus.ON_SALE)));
        // status=0 下架
        when(productReadQuery.productById(productId))
                .thenReturn(Optional.of(
                        new ProductView(productId, UUID.randomUUID(), "测试手机", null, null, null, ProductStatus.OFF)));

        assertThatThrownBy(() -> service.add(userId, request(1)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("下架");
    }

    @Test
    void 条目数达上限_防刷拦截() {
        stubSellable();
        when(cartItemMapper.selectByUserAndSku(userId, skuId)).thenReturn(null);
        when(cartItemMapper.countByUser(userId)).thenReturn(99L); // MAX_ITEMS_PER_USER

        assertThatThrownBy(() -> service.add(userId, request(1)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("最多存放");
    }
}
