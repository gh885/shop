package com.shop.platform.cms.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.cms.model.CmsStatus;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface BannerMapper extends BaseMapper<Banner> {

    /** 指定运营位的启用 banner，按排序返回（生效时间窗口过滤在调用侧做） */
    default List<Banner> selectEnabledBySlot(String slot) {
        return selectList(new LambdaQueryWrapper<Banner>()
                .eq(Banner::getSlot, slot)
                .eq(Banner::getStatus, CmsStatus.ENABLED)
                .orderByAsc(Banner::getSortOrder)
                .orderByAsc(Banner::getId));
    }

    /**
     * 后台 banner 全量列表（含停用条目与<b>不在生效时间窗口内</b>的那些），sortOrder 升序。
     *
     * <p>不套 start_at/end_at 过滤是后台与前台的唯一差别：定时上线的图在到点前也得看得见、改得动，
     * 拿前台那把尺子量后台等于藏住一批配置。slot 传 null = 全部运营位。
     *
     * <p>末位按 id 升序兜底：sortOrder 不填即同值（默认 0），没有第二把尺子时同值行的先后由数据库随手决定。
     */
    default List<Banner> selectBannerAllOrdered(String slot) {
        return selectList(new LambdaQueryWrapper<Banner>()
                .eq(slot != null, Banner::getSlot, slot)
                .orderByAsc(Banner::getSortOrder)
                .orderByAsc(Banner::getId));
    }
}
