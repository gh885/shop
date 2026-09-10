package com.shop.platform.logistics.service;

import java.util.List;

/**
 * 承运商轨迹网关（端口）—— 把"去承运商那里问轨迹"这件事收敛成一个接口。
 *
 * <p>为什么要有这层：各家聚合服务（快递鸟 / 快递100 / 顺丰丰桥）的协议、签名、字段各不相同，
 * 但领域只关心"给我这个运单号的节点列表"。适配细节在 {@code infra} 子包，领域逻辑（去重、单调推进、签收回写）
 * 完全不知道对方是谁——换供应商只换实现。
 *
 * <p>实现可能"未启用"（缺密钥/未配置）：{@link #available()} 为 false 时调用方直接跳过，
 * 而不是抛异常——本地开发与测试环境不该因为没接承运商就满屏报错。
 */
public interface CarrierTrackingGateway {

    /** 是否可用（已配置且启用）。false 时 {@link #fetchTracker} 不应被调用 */
    boolean available();

    /**
     * 拉取一个运单号的轨迹节点。
     *
     * <p>返回原始形态（粗状态 + 自然语言），归一化交给 {@code model.TrackingNormalizer}。
     * 网络/协议异常直接抛出——调用方（轮询任务）负责记日志并让下一轮重试。
     */
    List<CarrierTrackingNode> fetchTracker(String carrierCode, String trackingNo);
}
