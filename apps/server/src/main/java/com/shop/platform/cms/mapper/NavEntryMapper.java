package com.shop.platform.cms.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.cms.model.CmsStatus;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface NavEntryMapper extends BaseMapper<NavEntry> {

    /** 前台导航位启用条目，按排序返回（subs 为 JSONB 整段带出） */
    default List<NavEntry> selectEnabledByKey(String navKey) {
        return selectList(new LambdaQueryWrapper<NavEntry>()
                .eq(NavEntry::getNavKey, navKey)
                .eq(NavEntry::getStatus, CmsStatus.ENABLED)
                .orderByAsc(NavEntry::getSortOrder)
                .orderByAsc(NavEntry::getId));
    }
}
