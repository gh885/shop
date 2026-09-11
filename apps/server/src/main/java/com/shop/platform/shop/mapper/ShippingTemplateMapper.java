package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShippingTemplateMapper extends BaseMapper<ShippingTemplate> {

    /** 本店生效模板（软删由 @TableLogic 自动过滤；每店至多一个，唯一索引兜底） */
    default Optional<ShippingTemplate> selectByShop(UUID shopId) {
        return selectList(new LambdaQueryWrapper<ShippingTemplate>().eq(ShippingTemplate::getShopId, shopId)).stream()
                .findFirst();
    }
}
