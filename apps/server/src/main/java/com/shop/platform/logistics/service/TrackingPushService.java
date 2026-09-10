package com.shop.platform.logistics.service;

import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 承运商推送的落地 —— 验签解析（{@link CarrierPushReceiver}）之后的领域处理：
 * 运单号 → 包裹 → 归一化 → 落库。
 *
 * <p>落库复用 {@link TrackingSyncService#record}：推送与轮询必须是同一条路径，
 * 否则「先推送后轮询」和「先轮询后推送」会产出不同结果。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TrackingPushService {

    private final CarrierPushReceiver receiver;

    private final TrackingSyncService trackingSyncService;

    private final ShipmentMapper shipmentMapper;

    /**
     * 接收一次推送。
     *
     * <p>找不到包裹时<b>静默成功</b>（记日志不报错）：推送里只有承运商的运单号，
     * 而我们可能因为各种原因没有这个包裹（老单、测试数据、别人的单）。报错会让对方按重试策略重推——
     * 一个我们永远处理不了的报文，重推多少次都没用。
     */
    public void accept(String carrierCode, String requestData, String dataSign) {
        CarrierPush push = receiver.receive(carrierCode, requestData, dataSign);
        Shipment shipment = shipmentMapper.selectByTrackingNo(push.trackingNo());
        if (shipment == null) {
            log.info("[LOGISTICS] 推送未匹配到包裹，忽略, 运单号={}", push.trackingNo());
            return;
        }
        int recorded = trackingSyncService.record(shipment, push.nodes());
        log.info(
                "[LOGISTICS] 推送落库, shipmentId={}, 运单号={}, 新增节点={}/{}",
                shipment.getId(),
                push.trackingNo(),
                recorded,
                push.nodes().size());
    }
}
