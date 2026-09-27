package com.shop.platform.audit.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 审计账本的一行：谁（operator）对哪类对象的哪个实例（target）做了什么（action）、什么时候、说明是什么。
 *
 * <p>append-only：继承 {@link BaseEntity}（不记 updated_at），本模块没有 UPDATE 入口。
 * {@code operatorName} 是展示名快照而非外键——员工改名或被删后，账本仍要能读懂「谁做的」。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("audit.audit_records")
public class AuditRecord extends BaseEntity {

    /** {@link com.shop.platform.audit.api.AuditAction} 的 code 文本 */
    private String action;

    /** {@link com.shop.platform.audit.api.AuditTargetType} 枚举名 */
    private String targetType;

    /** 被操作对象 ID 文本（对象 ID 都是 UUID，存文本免去按类型分支） */
    private String targetId;

    /** 操作人 = 平台员工 id */
    private UUID operatorId;

    /** 操作人展示名快照 */
    private String operatorName;

    /** 键值说明；敏感字段只允许以掩码形状落库 */
    private String detail;
}
