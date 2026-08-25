package com.shop.platform.cart.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.cart.dto.AddCartItemRequest;
import com.shop.platform.cart.mapper.CartItem;
import com.shop.platform.common.BusinessException;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.product.api.ProductReadQuery;
import com.shop.platform.product.api.ProductView;
import com.shop.platform.product.api.SkuView;
import com.shop.platform.shop.api.ShopReadQuery;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

/**
 * 加购业务单测：可加购判定（SKU 在售 + SPU 上架）、同 SKU 合并累加封顶、条目数防刷、
 * 并发撞唯一索引回退为合并。整车视图拼装与真库链路见控制器测试 / IT。
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
                .thenReturn(Optional.of(new SkuView(skuId, productId, "黑色 S", null, 1000L, null, "CNY", 1)));
        when(productReadQuery.productById(productId))
                .thenReturn(Optional.of(new ProductView(productId, UUID.randomUUID(), "测试手机", null, null, null, 1)));
    }

    @Test
    void 新条目_默认勾选() {
        stubSellable();
        when(cartItemMapper.selectByUserAndSku(userId, skuId)).thenReturn(null);
        when(cartItemMapper.countByUser(userId)).thenReturn(0L);
        when(cartItemMapper.insert(any(CartItem.class))).thenReturn(1);

        CartItem item = service.add(userId, request(2));

        assertThat(item.getQuantity()).isEqualTo(2);
        assertThat(item.getSelected()).isTrue();
    }

    @Test
    void 同SKU已在车_合并累加() {
        stubSellable();
        CartItem existing = CartItem.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .skuId(skuId)
                .quantity(3)
                .selected(true)
                .build();
        when(cartItemMapper.selectByUserAndSku(userId, skuId)).thenReturn(existing);

        CartItem merged = service.add(userId, request(2));

        assertThat(merged).isSameAs(existing); // 原行更新，不插新行
        assertThat(merged.getQuantity()).isEqualTo(5);
        verify(cartItemMapper).updateById(existing);
        org.mockito.Mockito.verify(cartItemMapper, org.mockito.Mockito.never()).insert(any(CartItem.class));
    }

    @Test
    void 合并_数量封顶999() {
        // 纯实体方法：合并上限是 CartItem 自己的不变式
        CartItem existing = CartItem.builder().quantity(995).build();

        assertThat(existing.mergedQuantity(10)).isEqualTo(999); // 顶到单条目上限
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
                .thenReturn(Optional.of(new SkuView(skuId, productId, "x", null, 1000L, null, "CNY", 1)));
        // status=0 下架
        when(productReadQuery.productById(productId))
                .thenReturn(Optional.of(new ProductView(productId, UUID.randomUUID(), "测试手机", null, null, null, 0)));

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

    @Test
    void 并发重复加购撞唯一索引_回退为合并() {
        stubSellable();
        when(cartItemMapper.selectByUserAndSku(userId, skuId))
                .thenReturn(null) // 首查无
                .thenReturn(CartItem.builder().quantity(4).build()); // 撞索引后回查到赢家行
        when(cartItemMapper.countByUser(userId)).thenReturn(0L);
        when(cartItemMapper.insert(any(CartItem.class))).thenThrow(new DuplicateKeyException("uk"));

        CartItem item = service.add(userId, request(6));

        assertThat(item.getQuantity()).isEqualTo(10); // 4 + 6 合并
        org.mockito.Mockito.verify(cartItemMapper).updateById(item);
    }
}
