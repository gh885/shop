package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.logistics.model.ShipmentIssueStatus;
import com.shop.platform.logistics.model.ShipmentIssueType;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 物流异常单 —— 扫描的产物，记录"该有动静却没有"的包裹，供客服主动跟进。
 *
 * <p>{@link #detail} 存人话（含停滞时长），客服不必回到轨迹里自己算。
 * 同一包裹同一类异常同时至多一张未结单（部分唯一索引，见迁移 V52）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("logistics.shipment_issues")
public class ShipmentIssue extends AuditedEntity {

    /** 卡住的包裹，logistics.shipments.id */
    private UUID shipmentId;

    private ShipmentIssueType type;

    private ShipmentIssueStatus status;

    /** 人话说明（"超过 48 小时无中转动态"，最后一条动态时间等） */
    private String detail;

    /** 发现时刻（首次扫到的时间，不是包裹开始停滞的时间） */
    private OffsetDateTime detectedAt;

    /** 结单时刻 */
    private OffsetDateTime resolvedAt;
}
