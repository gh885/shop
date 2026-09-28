package com.shop.platform.compliance.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

/**
 * 违禁词表读取。闸门每次要的是<b>整集</b>（词表小到可以一次读完再在内存里匹配，
 * 换来的是「一次写入只查一次库、且不在事务里做 N 次 SELECT」）。
 *
 * <p>写入（运营增删词）本轮不开：词表随 V73 迁移种子，admin 词表管理页在 P2。
 * 本接口刻意只读——闸门的正确性依赖「词表不会被业务写入悄悄改掉」。
 */
@Mapper
public interface ForbiddenWordMapper extends BaseMapper<ForbiddenWord> {

    /** 闸门读的那一集：只取启用的词，按分类升序——报错只报第一个命中，这个顺序就是卖家先看到哪一类 */
    default List<ForbiddenWord> selectEnabled() {
        return selectList(new LambdaQueryWrapper<ForbiddenWord>()
                .eq(ForbiddenWord::getEnabled, true)
                .orderByAsc(ForbiddenWord::getCategory));
    }
}
