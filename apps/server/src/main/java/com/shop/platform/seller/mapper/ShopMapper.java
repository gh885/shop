package com.shop.platform.seller.mapper;

import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 店铺点查的 SQL：店铺是 seller 的表，名字只从这里出。 */
@Mapper
public interface ShopMapper {

    @Select("SELECT name FROM seller.shop WHERE id = #{id}")
    Optional<String> findName(@Param("id") UUID shopId);
}
