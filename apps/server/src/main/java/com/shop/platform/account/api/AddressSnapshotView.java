package com.shop.platform.account.api;

import java.util.UUID;

/**
 * 地址快照的跨模块投影：trade 下单时按 addressId 点查这一份，校验归属后展开落进订单。
 *
 * <p>带 {@code buyerId} 是因为<b>归属校验是消费方职责</b>——查无此行与「不是你的地址」
 * 要回答同一句 404，这个口径只有拿着买家上下文的调用方才能执行。
 *
 * <p>三段码由 regionCode 派生（国标 6 位码前 2 位省、前 4 位市、全 6 位区县）：
 * 算价指纹与运费匹配要的是码，派生放这里，消费方不用自己拆。
 */
public record AddressSnapshotView(
        UUID buyerId,
        String receiverName,
        String phone,
        String regionCode,
        String province,
        String city,
        String district,
        String detail) {

    public String provinceCode() {
        return regionCode.substring(0, 2);
    }

    public String cityCode() {
        return regionCode.substring(0, 4);
    }

    public String districtCode() {
        return regionCode;
    }
}
