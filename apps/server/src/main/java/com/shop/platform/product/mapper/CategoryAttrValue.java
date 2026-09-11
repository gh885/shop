package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.product.model.AttrValueSource;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 类目属性枚举值 —— 属性的值域条目；param 可无值域（纯自由输入）。
 *
 * <p>valueId 是规格值的身份：SKU 以 valueId 组合（skus.spec_key）为身份，改名只动 value 快照。
 * 第一版不支持删值（YAGNI），改名/排序支持；改名由 CategoryAttrService.updateValue 同事务刷新 SKU 快照。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("product.category_attr_values")
public class CategoryAttrValue extends AuditedEntity {

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
}
