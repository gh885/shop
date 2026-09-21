package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ProductMapper extends BaseMapper<Product> {

    /**
     * 归属校验：商品存在（404）且属于店铺上下文（X-Shop-Id 对应的 shopId，否则 403）。
     * 卖家侧一切按 ID 操作商品的入口统一走这里，防止跨店读写——「越权说什么」只该定义一处。
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

    /**
     * 级联下架（店铺停止营业时由 shop :: events 的监听器调用）：把该店全部「上架」商品置「仓库中」，返回下架行数。
     *
     * <p>单语句条件更新，读-改-写窗口内新上架的商品要么被这条 UPDATE 扫到、要么根本不在 PUBLISHED 集合里，
     * 不会漏也无需乐观锁；草稿/已在仓库的商品原样不动（下架只对在售的商品有意义）。
     * 与卖家手动 {@code ProductService.off} 同一目标态、同一条链路：下架不通知任何别的模块（product 无 events 包）。
     */
    @Update(
            """
            UPDATE product.products
            SET status = 'WAREHOUSE', updated_at = #{now}
            WHERE shop_id = #{shopId} AND status = 'PUBLISHED'
            """)
    int takedownPublished(@Param("shopId") UUID shopId, @Param("now") OffsetDateTime now);
}
