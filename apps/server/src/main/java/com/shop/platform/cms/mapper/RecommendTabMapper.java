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

    /**
     * 后台词条全量列表（含停用词条），sortOrder 升序，无过滤条件。
     *
     * <p>末位按 id 升序兜底：sortOrder 不填即同值（默认 0），没有第二把尺子时同值行的先后由数据库随手决定，
     * 运营刷新一次就看到词条在跳。
     */
    default List<RecommendTab> selectTabAllOrdered() {
        return selectList(new LambdaQueryWrapper<RecommendTab>()
                .orderByAsc(RecommendTab::getSortOrder)
                .orderByAsc(RecommendTab::getId));
    }
}
