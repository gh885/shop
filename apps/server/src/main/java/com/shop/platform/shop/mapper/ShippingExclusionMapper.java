package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShippingExclusionMapper extends BaseMapper<ShippingExclusion> {

    /** 模板的全部不配送地区前缀 */
    default List<ShippingExclusion> selectByTemplate(UUID templateId) {
        return selectList(new LambdaQueryWrapper<ShippingExclusion>().eq(ShippingExclusion::getTemplateId, templateId));
    }

    /** 模板更新时整批重建 */
    default int deleteByTemplate(UUID templateId) {
        return delete(new LambdaQueryWrapper<ShippingExclusion>().eq(ShippingExclusion::getTemplateId, templateId));
    }
}
