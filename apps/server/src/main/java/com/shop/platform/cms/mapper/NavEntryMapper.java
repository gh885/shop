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

    /**
     * 后台导航全量列表（含停用条目——后台要能改回被停用的那一条），sortOrder 升序。
     *
     * <p>navKey 传 null = 全部导航位（后台默认给整张表，运营不必先选位）。
     *
     * <p>末位按 id 升序兜底是必需的而不是装饰：sortOrder 由运营手填、不填即同值（默认 0），没有第二把尺子时
     * 同值行的先后由数据库随手决定，刷新一次列表就换一次顺序。
     */
    default List<NavEntry> selectNavAllOrdered(String navKey) {
        return selectList(new LambdaQueryWrapper<NavEntry>()
                .eq(navKey != null, NavEntry::getNavKey, navKey)
                .orderByAsc(NavEntry::getSortOrder)
                .orderByAsc(NavEntry::getId));
    }
}
