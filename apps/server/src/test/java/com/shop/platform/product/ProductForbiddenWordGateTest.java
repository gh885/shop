package com.shop.platform.product;

import static com.shop.platform.compliance.api.ForbiddenWordCommand.CleanText;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.compliance.api.ForbiddenWordCommand;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.SkuMapper;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.service.CategoryAttrService;
import com.shop.platform.product.service.CategoryService;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.SkuService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 违禁词闸门挂在商品哪几道上（COM-01）的单测（Mockito，不碰库）。
 *
 * <p>钉的是<b>时机与送审内容</b>，不是命中判定本身（那在 {@code ForbiddenWordMatcherTest}）：
 *  1. 草稿态编辑放行——卖家得先把内容填进去，拦在草稿上等于不让人写作；
 *  2. 非草稿态编辑即时过闸——只在发布时拦是不够的，「先上架、再把标题改成违禁词」正好绕开那道门；
 *  3. 发布与重新上架共用同一道门槛；
 *  4. 送审的是 PATCH 合并后的那一对值（只改卖点时标题取存量），不是请求里的那半截；
 *  5. 命中即中止，商品一个字都不落库——「内容没过闸但库已改」就不是闸门。
 *
 * <p>状态机与发布门槛的其余条目归 ProductIT（真库），这里不重复。
 */
@ExtendWith(MockitoExtension.class)
class ProductForbiddenWordGateTest {

    private static final UUID SHOP_ID = UUID.fromString("00000000-0000-4000-8000-0000000000a1");
    private static final UUID PRODUCT_ID = UUID.fromString("00000000-0000-4000-8000-0000000000c1");

    /** 闸门命中时后端抛的那一句（等价 ForbiddenWordService 的产物，这里只取其形状） */
    private static final BusinessException HIT = BusinessException.badRequest(ErrorCodes.FORBIDDEN_WORD_HIT, "命中了");

    @Mock
    private ProductMapper productMapper;

    @Mock
    private CategoryService categoryService;

    @Mock
    private SkuMapper skuMapper;

    @Mock
    private CategoryAttrService categoryAttrService;

    @Mock
    private SkuService skuService;

    @Mock
    private StockCommand stockCommand;

    @Mock
    private StockReadQuery stockReadQuery;

    @Mock
    private ForbiddenWordCommand forbiddenWordCommand;

    @InjectMocks
    private ProductService productService;

    private static Product product(ProductStatus status, String name, String subtitle) {
        return Product.builder()
                .id(PRODUCT_ID)
                .shopId(SHOP_ID)
                .status(status)
                .name(name)
                .subtitle(subtitle)
                .build();
    }

    private static ProductService.UpdateBasicCommand basic(String name, String subtitle) {
        return new ProductService.UpdateBasicCommand(null, name, subtitle, null, null, null, null, null);
    }

    @Test
    void 草稿编辑改名_不过闸() {
        when(productMapper.requireShopOwned(SHOP_ID, PRODUCT_ID)).thenReturn(product(ProductStatus.DRAFT, "旧标题", null));

        productService.updateBasic(SHOP_ID, PRODUCT_ID, basic("全网最佳", null));

        verifyNoInteractions(forbiddenWordCommand);
    }

    @Test
    void 已上架改标题_即时过闸_送审的是新标题加存量卖点() {
        when(productMapper.requireShopOwned(SHOP_ID, PRODUCT_ID))
                .thenReturn(product(ProductStatus.PUBLISHED, "宠物喂食器", "断电续航 72 小时"));

        productService.updateBasic(SHOP_ID, PRODUCT_ID, basic("全网最佳", null));

        verify(forbiddenWordCommand)
                .assertAllClean(new CleanText("name", "标题", "全网最佳"), new CleanText("subtitle", "卖点", "断电续航 72 小时"));
    }

    @Test
    void 仓库中只改卖点_送审的是存量标题加新卖点() {
        when(productMapper.requireShopOwned(SHOP_ID, PRODUCT_ID))
                .thenReturn(product(ProductStatus.WAREHOUSE, "宠物喂食器", null));

        productService.updateBasic(SHOP_ID, PRODUCT_ID, basic(null, "支持刷单返现"));

        verify(forbiddenWordCommand)
                .assertAllClean(new CleanText("name", "标题", "宠物喂食器"), new CleanText("subtitle", "卖点", "支持刷单返现"));
    }

    @Test
    void 非草稿编辑命中_中止_商品一个字都不落库() {
        when(productMapper.requireShopOwned(SHOP_ID, PRODUCT_ID))
                .thenReturn(product(ProductStatus.PUBLISHED, "宠物喂食器", null));
        doThrow(HIT).when(forbiddenWordCommand).assertAllClean(any(), any());

        assertThatThrownBy(() -> productService.updateBasic(SHOP_ID, PRODUCT_ID, basic("全网最佳", null)))
                .isInstanceOfSatisfying(
                        BusinessException.class, e -> assertThat(e.getCode()).isEqualTo(ErrorCodes.FORBIDDEN_WORD_HIT));
        verify(productMapper, never()).updateById(any(Product.class));
        verify(productMapper, never()).clearSubtitle(any());
    }

    @Test
    void 入库发布_过的是同一道闸_命中则状态不动() {
        when(productMapper.requireShopOwned(SHOP_ID, PRODUCT_ID))
                .thenReturn(product(ProductStatus.DRAFT, "全网最佳", null));
        doThrow(HIT).when(forbiddenWordCommand).assertAllClean(any(), any());

        assertThatThrownBy(() -> productService.publish(SHOP_ID, PRODUCT_ID, ProductStatus.WAREHOUSE))
                .isInstanceOf(BusinessException.class);
        verify(forbiddenWordCommand)
                .assertAllClean(new CleanText("name", "标题", "全网最佳"), new CleanText("subtitle", "卖点", null));
        verify(productMapper, never()).transitionStatus(any(), any(), any());
    }

    @Test
    void 重新上架_下架期间改出来的违禁词照样拦() {
        when(productMapper.requireShopOwned(SHOP_ID, PRODUCT_ID))
                .thenReturn(product(ProductStatus.WAREHOUSE, "全网最佳", "支持刷单"));
        doThrow(HIT).when(forbiddenWordCommand).assertAllClean(any(), any());

        assertThatThrownBy(() -> productService.on(SHOP_ID, PRODUCT_ID)).isInstanceOf(BusinessException.class);
        verify(forbiddenWordCommand)
                .assertAllClean(new CleanText("name", "标题", "全网最佳"), new CleanText("subtitle", "卖点", "支持刷单"));
        verify(productMapper, never()).transitionStatus(any(), any(), any());
    }
}
