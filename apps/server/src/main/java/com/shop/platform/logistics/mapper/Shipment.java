package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 包裹 —— 一次发货一行，是"货"的载体（运单号是"号"，可换单，故分列不合并）。
 *
 * <p>{@link #status} 是<b>时间戳的镜像</b>：待发货（{@code shipped_at} 为空）→ 已发出 → 已签收，
 * 旁支已取消。状态只经 {@code ShipmentMapper} 的条件更新推进，没有直接 setStatus 的入口。
 * 轨迹节点（{@link TrackingNode}）是展示流水，不再参与状态推导——承运商推送乱序不会改写履约。
 *
 * <p>{@link #carrierName} 是发货时刻的展示快照（承运商改名不改写历史单据）。
 * DB 列存枚举 {@code name()}（varchar + 默认 EnumTypeHandler），迁移 V83 的 CHECK 与取值同步。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("logistics.shipments")
public class Shipment extends AuditedEntity {

    /** 所属订单，orders.orders.id，跨 schema 裸引用不加 FK */
    private UUID orderId;

    /** 买家，account.users.id；买家查轨迹的归属依据（不必回查订单，出度为零） */
    private UUID userId;

    /** 卖家店铺，shop.shops.id */
    private UUID shopId;

    /** 正向履约 / 逆向回寄 */
    private ShipmentDirection direction;

    /** 承运商稳定标识（字典 code）；老端点手填的名字匹配不上字典时为 null */
    private String carrierCode;

    /** 承运商展示名（发货时刻快照：承运商改名不改写历史单据） */
    private String carrierName;

    /** 运单号；库上有唯一索引（一个运单号只属于一个订单） */
    private String trackingNo;

    /** 履约状态：待发货 / 已发出 / 已签收 / 已取消，只经条件更新推进 */
    private ShipmentStatus status;

    /** 交寄时刻：待发货为空，已发出起非空。累计发出量只认它非空的包裹 */
    private OffsetDateTime shippedAt;

    /** 签收时刻：已签收必有 */
    private OffsetDateTime signedAt;

    /** 取消时刻：已取消必有。取消已发出的包裹会回退订单行的有效发货量 */
    private OffsetDateTime cancelledAt;

    // 面单寄件人快照（发货时刻定格）：从 orders 搬来，它本质是面单 = 包裹的属性
    private String shipFromContactName;

    private String shipFromPhone;

    private String shipFromProvince;

    private String shipFromCity;

    private String shipFromDistrict;

    private String shipFromDetail;

    /** 面单寄件人名称（履约主体，镜像商家地址的 company_name） */
    private String shipFromCompanyName;
}
