package com.shop.platform.logistics.service;

import com.shop.platform.logistics.dto.TrackingNodeRequest;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.model.TrackingNodeCode;
import com.shop.platform.logistics.model.TrackingNormalizer;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 轨迹同步 —— 从承运商拉一次轨迹并落库（轮询兜底的执行体）。
 *
 * <p>刻意<b>不</b>在这里重复实现去重与状态推进：落库一律经 {@link TrackingService#recordNode}，
 * 它已经有业务唯一键去重与 rank 单调推进，且被真库 IT 钉死。同步层只做三件事：
 * 翻译（{@link TrackingNormalizer}）、逐条投递、把失败留在日志里。
 *
 * <p>单条节点失败不影响其余节点（各自独立事务）；整批拉取失败只记日志——轮询任务的下一轮自然会重试，
 * 这也是为什么这里不抛出：一个运单号的网络抖动不该让整轮扫描中断。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TrackingSyncService {

    private final CarrierTrackingGateway gateway;

    private final TrackingService trackingService;

    /**
     * 主动拉取一个包裹的轨迹（轮询兜底）。
     *
     * @return 真正落库的节点条数（重复推送与无法判定的条目都不计）
     */
    public int sync(Shipment shipment) {
        if (!gateway.available()) {
            return 0;
        }
        List<CarrierTrackingNode> nodes;
        try {
            nodes = gateway.fetchTracker(shipment.getCarrierCode(), shipment.getTrackingNo());
        } catch (RuntimeException e) {
            log.warn(
                    "[LOGISTICS] 拉取轨迹失败，等下一轮重试, shipmentId={}, 运单号={}, 原因={}",
                    shipment.getId(),
                    shipment.getTrackingNo(),
                    e.toString());
            return 0;
        }
        return record(shipment, nodes);
    }

    /**
     * 落库一批原始节点（拉取与推送共用同一条路径）。
     *
     * <p>刻意让两个方向共用：去重与单调推进的规则只有一份，推送和轮询不该有行为差异
     * （历史上这类"两个入口两套规则"的分叉是状态错乱的头号来源）。
     *
     * @return 真正落库的节点条数
     */
    public int record(Shipment shipment, List<CarrierTrackingNode> nodes) {
        int recorded = 0;
        for (CarrierTrackingNode node : nodes) {
            if (node.occurredAt() == null) {
                // 时刻解析不出来的条目在落库前跳过：时间戳是状态推进与排序的依据，宁可少一条也不用错时刻
                log.warn("[LOGISTICS] 轨迹缺少事件时刻，跳过, 运单号={}, 原文={}", shipment.getTrackingNo(), node.description());
                continue;
            }
            Optional<TrackingNodeCode> code = TrackingNormalizer.normalize(node.rawState(), node.description());
            if (code.isEmpty()) {
                // 不猜：无法判定的条目只留日志，等关键词表有样本支撑再扩
                log.debug("[LOGISTICS] 轨迹无法归一，跳过, 运单号={}, 原文={}", shipment.getTrackingNo(), node.description());
                continue;
            }
            try {
                boolean inserted = trackingService.recordNode(
                        shipment.getId(),
                        new TrackingNodeRequest(code.get(), node.occurredAt(), node.description(), node.location()));
                if (inserted) {
                    recorded++;
                }
            } catch (RuntimeException e) {
                log.warn("[LOGISTICS] 轨迹落库失败, shipmentId={}, 节点={}, 原因={}", shipment.getId(), code.get(), e.toString());
            }
        }
        return recorded;
    }
}
