package com.shop.platform.infra.db;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 所有持久化实体的公共列：主键 + 创建时间。
 *
 * <p>主键由应用层生成 uuidv7（{@link MyBatisPlusMetaObjectHandler}），一旦创建不可变；
 * created_at 由 MyBatis-Plus 插入时自动填充。
 *
 * <p>子类用 {@code @SuperBuilder} 而非 {@code @Builder}：字段在父类，子类 builder 必须能链式带上它们；
 * 同时要 {@code @EqualsAndHashCode(callSuper = true)}，否则实体相等性会漏掉主键与时间列。
 *
 * <p>表另记 updated_at 的实体继承 {@link AuditedEntity}（多一列），不要反过来给没有该列的实体强加填充字段——
 * MyBatis-Plus 会把实体上的每一列写进 INSERT。
 */
@Data
@SuperBuilder
@NoArgsConstructor
public abstract class BaseEntity {

    /** 主键。应用层生成 uuidv7，一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
}
