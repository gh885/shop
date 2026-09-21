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
 * <p>{@link #status} 是 {@link TrackingNode} 轨迹的<b>投影</b>，只由 {@code ShipmentMapper.advanceStatus} 按
 * {@link ShipmentStatus#sourcesOf} 的合法前态集单调推进，没有任何直接 setStatus 的入口。
 * {@link #carrierName} 是发货时刻的展示快照（承运商改名不改写历史单据）；字典化的承运商 code 在二期加。
 *
 * <p>DB 列存枚举 {@code name()}（varchar + 默认 EnumTypeHandler），迁移 V50 的 CHECK 与取值同步。
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

    /** 包裹状态（轨迹投影），只经条件更新单调推进 */
    private ShipmentStatus status;

    /** 发货时刻（与 orders.shipped_at 同源，由发货事件携带） */
    private OffsetDateTime shippedAt;

    /** 签收时刻（DELIVERED 节点回填），未签收为 null */
    private OffsetDateTime deliveredAt;

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
