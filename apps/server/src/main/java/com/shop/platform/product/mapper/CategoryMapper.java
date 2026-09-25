package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CategoryMapper extends BaseMapper<Category> {

    /**
     * 全表读（含禁用节点）：类目表不到百行，「谁可见」不在这里判——启用过滤与「父级不可见整支剪掉」的裁剪
     * 口径都在 service（PRD-06），三份读用同一个取数形状。
     *
     * <p>刻意<b>不</b>在 SQL 里带 status 条件：管理端树要看全量，禁用闸门要清点整支波及面，买家侧才只认启用档；
     * 把条件拆成两句 SQL，同一张树就有了两个答案。
     */
    default List<Category> selectAll() {
        return selectList(new LambdaQueryWrapper<Category>());
    }
}
