package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.BaseEntity;
import com.shop.platform.logistics.model.TrackingNodeCode;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 轨迹节点 —— append-only 事实：只插不改（故无 updated_at），包裹状态由它推导而来。
 *
 * <p>领域层只见归一化后的 {@link #nodeCode}；承运商原始状态码在接入边界翻译后即丢弃，
 * 原始描述留在 {@link #description} 供人看（不参与状态推导）。
 *
 * <p>{@link #dedupeKey} 是重推的拦截器：投递方重推会换 message id，只有业务唯一键可靠，
 * 插入走 {@code ON CONFLICT DO NOTHING}（见 TrackingNodeMapper）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("logistics.tracking_nodes")
public class TrackingNode extends BaseEntity {

    /** 所属包裹，logistics.shipments.id */
    private UUID shipmentId;

    /** 归一化节点码（承运商无关的词表），映射规则见 TrackingNodeCode */
    private TrackingNodeCode nodeCode;

    /** 承运商原始描述（展示用） */
    private String description;

    /** 发生地（网点/分拨中心名） */
    private String location;

    /** 承运商事件发生时刻：排序与状态推进的依据（迟到节点靠它显式排序，不靠落库时间） */
    private OffsetDateTime occurredAt;

    /** 去重键（库上唯一索引）：同一包裹 + 同一节点码 + 同一时刻 + 同一地点 = 同一条事实 */
    private String dedupeKey;

    /** 业务唯一键：去重不依赖投递方的 message id（重推会换 id），只认事实本身的四要素 */
    public static String dedupeKey(
            UUID shipmentId, TrackingNodeCode nodeCode, OffsetDateTime occurredAt, String location) {
        return shipmentId + "|" + nodeCode.name() + "|" + occurredAt.toInstant().toEpochMilli() + "|"
                + (location == null ? "" : location);
    }
}
