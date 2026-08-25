package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SkuMapper extends BaseMapper<Sku> {

    /** 商品全部 SKU（含各状态）：规格维护与发布校验用 */
    default List<Sku> selectByProductId(UUID productId) {
        return selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
    }

    /** 商品在售 SKU（买家详情只返在售卖法） */
    default List<Sku> selectOnSaleByProductId(UUID productId) {
        return selectList(
                new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId).eq(Sku::getStatus, Sku.STATUS_ON_SALE));
    }
}
