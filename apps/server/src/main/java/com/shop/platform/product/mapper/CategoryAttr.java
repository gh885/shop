package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.CategoryAttrStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 类目属性定义 —— 挂在叶子类目（level=3）上的属性模板条目。
 *
 * <p>kind=SPEC 销售属性（参与 SKU 生成，规格项由此 ID 化）；kind=PARAM 非销售参数（仅展示，required 位只对它有意义）。
 * 禁用同 categories 软删语义：不物理删，已被引用的存量快照自洽，新商品不可再选。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("product.category_attrs")
public class CategoryAttr {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属类目（只允许叶子类目挂模板，service 层校验 level=3），同 schema FK */
    private UUID categoryId;

    /** 属性名（如「颜色」「产地」）。同类目内唯一，uk_category_attrs_category_name 兜底并发重名 */
    private String name;

    /** spec 销售属性 / param 非销售参数，概念归 {@link AttrKind} */
    private AttrKind kind;

    /** param 是否必填；spec 恒参与 SKU 生成，该位仅对 param 有意义 */
    private Boolean required;

    /** 卖家可否扩充值域/自由输入；false 时提交值必须在值域内 */
    private Boolean allowCustom;

    /** 该规格维度是否允许卖家为每个取值上传配图（如颜色色卡） */
    private Boolean allowImage;

    /** 同类目内排序权重 */
    private Integer sort;

    /** 启用 / 禁用。同 categories 语义：查询侧裁剪，不写扩散，存量引用自洽 */
    private CategoryAttrStatus status;

    public boolean isEnabled() {
        return status != null && status.isEnabled();
    }

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
