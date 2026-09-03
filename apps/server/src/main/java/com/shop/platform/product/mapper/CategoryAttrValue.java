package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.product.model.AttrValueSource;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 类目属性枚举值 —— 属性的值域条目；param 可无值域（纯自由输入）。
 *
 * <p>valueId 是规格值的身份：SKU 以 valueId 组合（skus.spec_key）为身份，改名只动 value 快照。
 * 第一版不支持删值（YAGNI），改名/排序支持；改名由 CategoryAttrService.updateValue 同事务刷新 SKU 快照。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("product.category_attr_values")
public class CategoryAttrValue {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属属性 ID，同 schema FK */
    private UUID attrId;

    /** 值文本（如「曜石黑」）。同属性内唯一，uk_category_attr_values_attr_value 兜底并发建档 */
    private String value;

    /** 同属性内排序权重 */
    private Integer sort;

    /** 平台预置 / 卖家扩充 */
    private AttrValueSource source;

    /** 规格值默认图（URL/对象 key，可空），如「红色」对应色卡图 */
    private String image;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
