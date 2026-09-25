package com.shop.platform.product;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.service.ProductView;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 商品出参投影：{@code ProductView.from(Product, int)} 必须带出实体上的销量投影列，库存取调用方算好的真实值。
 * 曾写死 0：卖家端创建/发布/详情返回的销量永远是 0（列表行走 ProductListRow 才带着真值），库存同样恒 0——
 * 同一个字段在列表与详情/写响应里两个答案，前端无从分辨。
 */
class ProductResponseTest {

    @Test
    void from实体_销量投影列原样带出_不再写死0() {
        ProductView response = ProductView.from(product(), 0);

        assertThat(response.soldCount()).isEqualTo(42);
    }

    @Test
    void from实体_库存取传入的真实值_不再写死0() {
        assertThat(ProductView.from(product(), 17).stock()).isEqualTo(17);
    }

    private Product product() {
        Product product = new Product();
        product.setId(UUID.randomUUID());
        product.setShopId(UUID.randomUUID());
        product.setCategoryId(UUID.randomUUID());
        product.setName("测试商品");
        product.setDetailImages(List.of());
        product.setImages(List.of());
        product.setSpecs(List.of());
        product.setParams(List.of());
        product.setStatus(ProductStatus.PUBLISHED);
        product.setSoldCount(42);
        return product;
    }
}
