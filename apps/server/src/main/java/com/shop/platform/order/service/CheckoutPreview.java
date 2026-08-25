package com.shop.platform.order.service;

import com.shop.platform.common.Money;
import java.util.List;
import java.util.UUID;

/**
 * 结算预览出参形状 —— 有效行按店铺分组算钱（即拆单预告），失效/缺货行平铺置灰。
 *
 * <p>失效行进不了分组：店铺信息来自 SPU 投影，SPU 都没了就没法归组。address 可为 null（前端未选地址时）。
 */
public record CheckoutPreview(
        List<Group> groups, List<UnavailableLine> unavailable, Address address, Money totalPayAmount) {

    /** 单个店铺的结算分组：一组对应一笔待创建订单；行即 ValidLine（预览与下单同源同形状） */
    public record Group(
            UUID shopId,
            String shopName,
            List<ValidLine> lines,
            Money itemAmount,
            Money shippingFee,
            Money payAmount) {}

    /** 失效行：cause 区分「下架/删除」与「库存不足」，前端分别置灰和引导改数量 */
    public record UnavailableLine(UUID skuId, String name, String image, int quantity, String cause) {

        public static final String CAUSE_UNAVAILABLE = "UNAVAILABLE";

        public static final String CAUSE_STOCK_SHORTAGE = "STOCK_SHORTAGE";
    }

    /** 收货地址回显：地址簿 ID + 快照值对象（user_profile.addresses 只读投影，不含软删等内部字段） */
    public record Address(UUID id, AddressSnapshot snapshot) {}
}
