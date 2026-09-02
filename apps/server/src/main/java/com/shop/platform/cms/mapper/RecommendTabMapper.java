package com.shop.platform.cms.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.cms.model.CmsStatus;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RecommendTabMapper extends BaseMapper<RecommendTab> {

    /** 启用词条按排序返回 */
    default List<RecommendTab> selectEnabled() {
        return selectList(new LambdaQueryWrapper<RecommendTab>()
                .eq(RecommendTab::getStatus, CmsStatus.ENABLED)
                .orderByAsc(RecommendTab::getSortOrder)
                .orderByAsc(RecommendTab::getId));
    }
}
