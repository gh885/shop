package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ProductMapper extends BaseMapper<Product> {

    /** 销量投影累加（订单完成时经 product.api :: ProductCommand 调用）：单语句自增，并发完成不丢加 */
    @Update("UPDATE product.products SET sold_count = sold_count + #{quantity} WHERE id = #{productId}")
    int addSoldCount(@Param("productId") UUID productId, @Param("quantity") int quantity);
}
