package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CarrierMapper extends BaseMapper<Carrier> {

    /** 可选承运商（发货下拉）：只给启用的，按 sort_no 排序 */
    default List<Carrier> selectEnabled() {
        return selectList(new LambdaQueryWrapper<Carrier>()
                .eq(Carrier::getEnabled, true)
                .orderByAsc(Carrier::getSortNo)
                .orderByAsc(Carrier::getCode));
    }

    /** 按 code 取承运商（含停用，停用由调用方判定后拒绝）；不存在返回 null */
    default Carrier selectByCode(String code) {
        return selectOne(new LambdaQueryWrapper<Carrier>().eq(Carrier::getCode, code));
    }

    /**
     * 按展示名反查（老端点的兼容路径）：卖家手填「顺丰速运」时尝试归一到字典 code，
     * 匹配不上返回 null——调用方保留原文并让 code 留空，不因此拒绝发货（不破坏老前端）。
     */
    default Carrier selectByName(String name) {
        return selectOne(new LambdaQueryWrapper<Carrier>()
                .eq(Carrier::getName, name)
                .orderByAsc(Carrier::getSortNo)
                .last("LIMIT 1"));
    }
}
