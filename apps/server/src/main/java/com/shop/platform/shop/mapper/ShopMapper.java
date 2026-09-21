package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShopMapper extends BaseMapper<Shop> {

    /** 店名是否已被占用（全表口径，不看状态——被拒/被封的店名仍占位；并发由 uk_shops_name 兜底） */
    default boolean existsByName(String name) {
        return selectCount(new LambdaQueryWrapper<Shop>().eq(Shop::getName, name)) > 0;
    }
}
