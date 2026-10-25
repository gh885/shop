package com.shop.platform.common;

/**
 * 购物车的数量口径。上限与 cart.items 的 DB CHECK 一一对应（改这里必须同步改迁移）；
 * 前端同值镜像等前端重建购物车页时再定，不在此处预留出口。
 */
public final class CartRules {

    /** 车内条目种类上限：防刷闸门，超限拒收新种类（已在车内的同 SKU 累加不受它拦） */
    public static final int ITEM_KINDS_MAX = 120;

    /** 单条目数量上限：与 DB CHECK 同值，入口 400 / 入库才 400 之外的第三道闸是 DTO @Max（422） */
    public static final int LINE_QUANTITY_MAX = 999;

    private CartRules() {}
}
