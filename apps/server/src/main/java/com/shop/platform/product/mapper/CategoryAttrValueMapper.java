package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CategoryAttrValueMapper extends BaseMapper<CategoryAttrValue> {

    /**
     * 一批属性的值域（不承诺顺序：调用方按 attrId 分组后再在内存里按 sort/创建时间排，那是装配）。
     *
     * <p>批查而不是逐个属性一次 selectList：候选集本来就限定在同一份模板内，逐属性查会随属性数放大成 N 次往返。
     *
     * <p>空集合在语句内短路：MyBatis-Plus 会把空 {@code in} 拼成 {@code IN ()}，那是 PG 的语法错误而不是
     * 「一个值域都没有」，而零属性的调用方本来就该拿到空列表。
     */
    default List<CategoryAttrValue> selectByAttrIds(Collection<UUID> attrIds) {
        if (attrIds.isEmpty()) {
            return List.of();
        }
        return selectList(new LambdaQueryWrapper<CategoryAttrValue>().in(CategoryAttrValue::getAttrId, attrIds));
    }

    /**
     * 卖家扩充值的落库唯一语句：值域内已有同名则原样返回既有行（含平台预置行，不把 source 改成卖家），
     * 否则以 source=2 建档。DO UPDATE 写回同值只为让 RETURNING 出行（DO NOTHING 撞冲突时不返回任何行）。
     *
     * <p>做成 upsert 而不是「先查再插、撞唯一索引后 catch 回读」：PG 一旦因唯一索引报错就把整个事务标记为
     * aborted，catch 之后的任何语句都会 25P02 失败（pgjdbc 默认 autosave=never，不打 savepoint），回读路径
     * 根本执行不到。id / created_at / updated_at 由列默认值生成。
     */
    @Select("INSERT INTO product.category_attr_values (attr_id, value, sort, source)"
            + " VALUES (#{attrId}, #{value}, 0, 'SELLER')"
            + " ON CONFLICT (attr_id, value) DO UPDATE SET value = EXCLUDED.value"
            + " RETURNING *")
    CategoryAttrValue upsertSellerValue(@Param("attrId") UUID attrId, @Param("value") String value);
}
