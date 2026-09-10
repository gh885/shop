package com.shop.platform.logistics.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 包裹方向 —— 区分正向履约与逆向退货回寄。两条链路共用同一套包裹与轨迹模型（同一张表、同一个查询与展示路径），
 * 靠本列区分；一期只写 {@link #FORWARD}，逆向在售后回寄接入时启用。
 *
 * <p>DB 列存 {@code name()}，CHECK 约束与取值同步（迁移 V50）。
 */
@Schema(enumAsRef = true)
public enum ShipmentDirection {

    /** 正向：卖家发货给买家 */
    FORWARD,

    /** 逆向：买家退货回寄给卖家 */
    RETURN
}
