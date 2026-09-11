package com.shop.platform.infra.db;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.OffsetDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 表另带 {@code updated_at} 列的持久化实体：在 {@link BaseEntity} 之上补「最后改动时刻」。
 *
 * <p>继承哪一种取决于<b>表有没有这一列</b>，不是业务上「可变不可变」——append-only 账本
 * （流水/轨迹/状态日志）不记 updated_at，仍在改动但表不记改动时刻的（如类目属性值）也没有。
 * 给没有该列的表强加这个字段会让 INSERT 带上不存在的列。
 *
 * <p>updated_at 由 MyBatis-Plus 插入/更新时自动填充。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public abstract class AuditedEntity extends BaseEntity {

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
