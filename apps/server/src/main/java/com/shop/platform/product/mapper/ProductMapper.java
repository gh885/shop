package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ProductMapper extends BaseMapper<Product> {

    /**
     * 归属校验：商品存在（404）且属于店铺上下文（X-Shop-Id 对应的 shopId，否则 403）。
     * 卖家侧一切按 ID 操作商品的入口统一走这里，防止跨店读写——「越权说什么」只该定义一处（同 OrderMapper.requireShopOwned）。
     */
    default Product requireShopOwned(UUID shopId, UUID productId) {
        Product product = Validate.notNull(selectById(productId), "商品不存在");
        if (!product.getShopId().equals(shopId)) {
            throw BusinessException.forbidden("商品不属于当前店铺");
        }
        return product;
    }

    /** 销量投影累加（订单完成时经 product.api :: ProductCommand 调用）：单语句自增，并发完成不丢加 */
    @Update("UPDATE product.products SET sold_count = sold_count + #{quantity} WHERE id = #{productId}")
    int addSoldCount(@Param("productId") UUID productId, @Param("quantity") int quantity);
}
