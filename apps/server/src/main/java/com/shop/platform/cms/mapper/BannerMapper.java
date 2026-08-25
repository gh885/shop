package com.shop.platform.cms.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface BannerMapper extends BaseMapper<Banner> {

    /** 指定运营位的启用 banner，按排序返回（生效时间窗口过滤在调用侧做） */
    default List<Banner> selectEnabledBySlot(String slot) {
        return selectList(new LambdaQueryWrapper<Banner>()
                .eq(Banner::getSlot, slot)
                .eq(Banner::getStatus, Banner.STATUS_ENABLED)
                .orderByAsc(Banner::getSortOrder)
                .orderByAsc(Banner::getId));
    }
}
