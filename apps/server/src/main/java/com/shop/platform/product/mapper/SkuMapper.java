package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.product.model.SkuStatus;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SkuMapper extends BaseMapper<Sku> {

    /**
     * 反查引用了某属性值的全部 SKU（属性值改名时刷新快照用）。
     *
     * <p>条件走 JSONB containment 而非 {@code spec_key LIKE '%uuid%'}：前导通配任何索引都用不上，
     * 每次改名都要全表扫 product.skus；{@code @>} 由 idx_skus_attributes_gin 支撑（见 V31）。
     *
     * <p>必须经 wrapper 的 {@code apply} 挂条件、走 MyBatis-Plus 自己的 selectList，不能手写 {@code @Select}：
     * attributes 的 JSONB ↔ List&lt;SkuAttr&gt; 转换依赖 {@code @TableField(typeHandler=…)}，而该 handler 只在
     * MP 由 {@code @TableName(autoResultMap = true)} 生成的 ResultMap 上生效——手写 SQL 走自动映射，
     * attributes 会静默变成 null。{@code {0}} 是参数占位（编译为 ?），不是字符串拼接。
     */
    default List<Sku> selectByValueId(UUID valueId) {
        return selectList(new LambdaQueryWrapper<Sku>()
                .apply("attributes @> CAST({0} AS jsonb)", "[{\"valueId\": \"" + valueId + "\"}]"));
    }

    /** 商品全部 SKU（含各状态）：规格维护与发布校验用 */
    default List<Sku> selectByProductId(UUID productId) {
        return selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
    }

    /** 一批商品的全部 SKU（含各状态）：卖家工作台「商品列表」聚合库存用，一次捞回免逐商品 N+1 */
    default List<Sku> selectByProductIds(Collection<UUID> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return List.of();
        }
        return selectList(new LambdaQueryWrapper<Sku>().in(Sku::getProductId, productIds));
    }

    /** 商品在售 SKU（买家详情只返在售卖法） */
    default List<Sku> selectOnSaleByProductId(UUID productId) {
        return selectList(
                new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId).eq(Sku::getStatus, SkuStatus.ON_SALE));
    }
}
