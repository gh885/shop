package com.shop.platform.logistics.service;

/**
 * 承运商推送接收端口 —— 与 {@link CarrierTrackingGateway}（我们主动问）相对的另一半边界（对方推我们）。
 *
 * <p>实现负责<b>验签</b>与报文解析；签名不合法必须给 403（业务异常），报文缺字段给 400。
 * 把验签放在这一层而不是 controller，是为了让"边界校验"成为不可绕过的一步：
 * 领域服务拿到 {@link CarrierPush} 时，它的来源已经是可信的。
 */
public interface CarrierPushReceiver {

    /** 校验签名并解析推送报文；签名不合法抛 403，报文不合法抛 400 */
    CarrierPush receive(String carrierCode, String requestData, String dataSign);
}
