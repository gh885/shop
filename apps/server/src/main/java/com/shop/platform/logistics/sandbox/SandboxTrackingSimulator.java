package com.shop.platform.logistics.sandbox;

import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.sandbox.mapper.SandboxShipmentMapper;
import com.shop.platform.logistics.service.CarrierTrackingNode;
import com.shop.platform.logistics.service.TrackingSyncService;
import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 开发期轨迹模拟器 —— 让包裹在本地「自己长轨迹」，不用注册快递鸟、不用真寄件、不烧查询额度。
 *
 * <p><b>它的输出面 = 承运商的输出面。</b>模拟器只产「轨迹节点」这一种东西，写进系统的入口是
 * {@link TrackingSyncService#record}——与真实推送、轮询走的是同一条落库路径。包裹状态、订单履约态
 * 一概不碰：那些由 {@code TrackingService} 的条件更新与 {@code FulfillmentRecalcService} 从事实推出来。
 * 判定标准就一条：<b>把整个 sandbox 包删掉，业务代码零改动、测试全绿</b>。
 *
 * <p>为什么不做成 {@code CarrierTrackingGateway} 的实现：那个接口只拿得到承运商编码与运单号，
 * 没有交寄时刻，"发货后两小时该揽收"这句话就无从算起。模拟器需要的是包裹，不是单号。
 *
 * <p>不处理「待发货 → 自动交寄」（承运商揽收推动自动交寄那条路）：那条路已有真实现，
 * 交给真推送去验，模拟器不重复一份，免得两个假入口互相掩护。
 */
@Component
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "shop.logistics.sandbox", name = "enabled", havingValue = "true")
public class SandboxTrackingSimulator {

    /** 扫描间隔 5 秒：加速模式下整条链路只有 30 秒，再慢就演示不出来了 */
    private static final long TICK_MS = 5_000;

    /** 正常节奏的扫描窗口：只模拟两天内交寄的包裹 */
    private static final Duration WINDOW = Duration.ofHours(48);

    /** 加速节奏的扫描窗口：30 秒走完，10 分钟窗口足够 */
    private static final Duration ACCELERATED_WINDOW = Duration.ofMinutes(10);

    private final SandboxProperties props;

    private final SandboxShipmentMapper shipmentMapper;

    private final TrackingSyncService trackingSyncService;

    private final Environment environment;

    /**
     * 生产 profile 下拒绝启动。
     *
     * <p>不等同于"劝你别开"：模拟器产的是<b>伪造的物流事实</b>，混进生产库意味着包裹凭空签收、
     * 订单凭空完成、售后与对账全部对不上，而且是静默的——没有哪条告警会喊"这条轨迹是假的"。
     * 所以这里选 fail-fast，把误配的代价压在启动那一刻。
     */
    @PostConstruct
    void refuseToRunInProduction() {
        boolean production = Arrays.stream(environment.getActiveProfiles())
                .map(profile -> profile.toLowerCase(java.util.Locale.ROOT))
                .anyMatch(profile -> profile.equals("prod") || profile.equals("production"));
        if (production) {
            throw new IllegalStateException("shop.logistics.sandbox.enabled=true 在生产 profile 下被拒绝："
                    + "沙箱轨迹是伪造的物流事实，落进生产库会静默污染包裹履约与对账。"
                    + "开发/演示请只在 dev 环境打开它。");
        }
    }

    /**
     * 扫一轮在途包裹，把「此刻之前该发生的节点」补进去。
     *
     * <p>逐单处理而不是整批一个事务：单笔失败只丢那一笔，下一轮同批重扫就是重试通道
     * （与 {@code TrackingPollJob} 同一条哲学）。重复节点会被去重挡掉，所以「每一轮都重算全量」
     * 是安全的——不需要记住"算到哪了"。
     */
    @Scheduled(fixedDelay = TICK_MS)
    public void tick() {
        OffsetDateTime now = OffsetDateTime.now();
        Duration window = props.isAccelerated() ? ACCELERATED_WINDOW : WINDOW;
        List<Shipment> inFlight = shipmentMapper.selectInFlight(now.minus(window), props.getBatchLimit());
        if (inFlight.isEmpty()) {
            return;
        }
        int recorded = 0;
        for (Shipment shipment : inFlight) {
            try {
                recorded += trackingSyncService.record(shipment, nodesFor(shipment, now));
            } catch (RuntimeException e) {
                log.warn("[LOGISTICS][SANDBOX] 模拟轨迹失败，等下一轮重试, shipmentId={}, 原因={}", shipment.getId(), e.toString());
            }
        }
        // 没新增就不打日志：每 5 秒一行"0 条"会把本地控制台刷废
        if (recorded > 0) {
            log.info("[LOGISTICS][SANDBOX] 模拟轨迹, 在途={}, 新增节点={}", inFlight.size(), recorded);
        }
    }

    /**
     * 包裹 → 时间线入参：只取模拟需要的那四列。
     *
     * <p>模拟器不认识整个 {@link Shipment}，只认识「交寄时刻 + 承运商 + 运单号 + 寄件城市」——
     * 这四样正是真实承运商能说出口的东西，多一样都是在借业务字段编故事。
     */
    private List<CarrierTrackingNode> nodesFor(Shipment shipment, OffsetDateTime now) {
        return SandboxTimeline.nodesAt(
                new SandboxTimeline.Parcel(
                        shipment.getShippedAt(),
                        shipment.getCarrierCode(),
                        shipment.getTrackingNo(),
                        shipment.getShipFromCity()),
                now,
                props.isAccelerated(),
                props.isFlaky());
    }
}
