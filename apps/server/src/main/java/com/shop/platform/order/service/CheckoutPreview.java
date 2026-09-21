package com.shop.platform.order.service;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponAvailabilityView;
import java.util.List;
import java.util.UUID;

/**
 * 结算预览出参形状 —— 有效行按店铺分组算钱（即拆单预告），失效/缺货行平铺置灰。
 *
 * <p>失效行进不了分组：店铺信息来自 SPU 投影，SPU 都没了就没法归组。address 可为 null（前端未选地址时）。
 *
 * <p>金额构成：{@code payAmount = itemAmount + shippingFee - discountAmount}（与 orders 表的 CHECK 同口径）。
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
            /** 本店券的减免额；没用券为 0 */
            Money discountAmount,
            Money payAmount,
            /** 该店是否配送到收货地区（false = 命中了模板的不配送地区）：为 false 时下单必拒，预览页据此拦截 */
            boolean deliverable,
            /** 计费所用模板（未配模板为 null）：落进订单的计费快照列，不进 HTTP 出参（买家不需要知道模板 ID） */
            UUID shippingTemplateId,
            /**
             * 本店选中的券（没用券为 null）：下单据此占用并落订单快照。
             * 它是<b>已经过可用性判定</b>的候选，不是用户的原始入参——原始入参在这里就被判过了，
             * 不可用会当场 400，不会留到落库才发现。
             */
            CouponAvailabilityView appliedCoupon,
            /** 本店可用券评估（含不可用者与原因码）：结算页据此渲染选券区与「为什么不能用」 */
            List<CouponAvailabilityView> coupons) {}

    /** 失效行：cause 区分「下架/删除」与「库存不足」，前端分别置灰和引导改数量 */
    public record UnavailableLine(UUID skuId, String name, String image, int quantity, String cause) {

        public static final String CAUSE_UNAVAILABLE = "UNAVAILABLE";

        public static final String CAUSE_STOCK_SHORTAGE = "STOCK_SHORTAGE";
    }

    /** 收货地址回显：地址簿 ID + 快照值对象（account.addresses 只读投影，不含软删等内部字段） */
    public record Address(UUID id, AddressSnapshot snapshot) {}
}
