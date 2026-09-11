package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShippingRuleRegionMapper extends BaseMapper<ShippingRuleRegion> {

    /** 一组规则的区域前缀（报价时整批取回，避免逐条规则查询） */
    default List<ShippingRuleRegion> selectByRuleIds(Collection<UUID> ruleIds) {
        if (ruleIds == null || ruleIds.isEmpty()) {
            return List.of();
        }
        return selectList(new LambdaQueryWrapper<ShippingRuleRegion>().in(ShippingRuleRegion::getRuleId, ruleIds));
    }

    /** 按规则 ID 批量清区域（模板重建路径：先删区域再删规则，避免悬挂引用） */
    default int deleteByRuleIds(Collection<UUID> ruleIds) {
        if (ruleIds == null || ruleIds.isEmpty()) {
            return 0;
        }
        return delete(new LambdaQueryWrapper<ShippingRuleRegion>().in(ShippingRuleRegion::getRuleId, ruleIds));
    }
}
