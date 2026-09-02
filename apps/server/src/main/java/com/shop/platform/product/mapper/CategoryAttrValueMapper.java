package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CategoryAttrValueMapper extends BaseMapper<CategoryAttrValue> {

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
