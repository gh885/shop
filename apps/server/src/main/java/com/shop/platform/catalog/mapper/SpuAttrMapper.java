package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.model.ValueType;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * SPU 属性值的写入。
 *
 * <p><b>三个值列不是可选的装饰。</b> 原来这里写死 {@code value_text}，于是
 * {@code value_num} / {@code value_bool} 永远是 NULL，而它们一空：
 *
 * <ul>
 *   <li>{@code attribute.unit} 变成摆设——"1" 和 "100" 都只是文本，单位丢了，1m 和 100cm 是两个值
 *   <li>{@code idx_spu_attr_num} / {@code idx_spu_attr_bool} 两条索引扫不到任何行，筛选面板按数字筛不了
 *   <li>参数哈希拼不对：哈希要的是规范化后的值 + 单位，而文本里没有单位
 * </ul>
 *
 * <p>{@code ck_spu_attr_one_value} 强制三列恰好一个非空，所以这里必须按类型分派，
 * 而不是"能塞 text 就塞 text"。
 */
@Mapper
public interface SpuAttrMapper {

    @Insert(
            """
            INSERT INTO catalog.spu_attr (spu_id, attribute_id, value_index, value_text, value_num, value_bool)
            VALUES (#{spuId}, #{attributeId}, 0, #{valueText}, CAST(#{valueNum} AS numeric), CAST(#{valueBool} AS boolean))
            """)
    void insert(
            @Param("spuId") UUID spuId,
            @Param("attributeId") UUID attributeId,
            @Param("valueText") String valueText,
            @Param("valueNum") String valueNum,
            @Param("valueBool") String valueBool);

    /**
     * 按属性类型写进对应的值列。调用方已经从类目配置拿到了 {@code valueType}，
     * 这里不做类型推断——推断等于把"这个属性是什么类型"变成两处判断。
     *
     * @param valueType text / number / enum / bool
     * @throws IllegalArgumentException 数字或布尔解析不了。这是调用方的错，
     *     应该在发布闸门里被拦住，不该到这一层
     */
    default void insertAttribute(UUID spuId, UUID attributeId, ValueType valueType, String value) {
        String valueText = null;
        String valueNum = null;
        String valueBool = null;
        switch (valueType) {
            case NUMBER -> valueNum = value;
            case BOOL -> valueBool = value;
            default -> valueText = value;
        }
        insert(spuId, attributeId, valueText, valueNum, valueBool);
    }
}
