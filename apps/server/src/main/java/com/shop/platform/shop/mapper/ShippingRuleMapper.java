package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShippingRuleMapper extends BaseMapper<ShippingRule> {

    /** 模板下全部计费规则（默认规则 + 指定地区规则；一条模板规则数很少，整批取回内存里选） */
    default List<ShippingRule> selectByTemplate(UUID templateId) {
        return selectList(new LambdaQueryWrapper<ShippingRule>().eq(ShippingRule::getTemplateId, templateId));
    }

    /** 模板更新时整批重建规则，先清空（子表区域随规则 ID 一起清，见 ShippingRuleRegionMapper） */
    default int deleteByTemplate(UUID templateId) {
        return delete(new LambdaQueryWrapper<ShippingRule>().eq(ShippingRule::getTemplateId, templateId));
    }
}
