package com.shop.platform.logistics.model;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 轨迹归一化 —— 把承运商给的东西（自由文本 + 粗粒度状态码）翻成本模块的 {@link TrackingNodeCode}。
 *
 * <p><b>这是「原始码不进领域」那条规矩的落地处</b>：真实承运商的推送里，结构化字段往往只有
 * 一个粗状态（快递鸟的 {@code State}：1 揽收 / 2 在途 / 3 签收 / 4 问题件…），细节全在自然语言描述里
 * （"快件已到达【杭州转运中心】"）。所以判定的优先级是<b>细粒度文本优先，粗状态兜底</b>——
 * 反过来会把"派送中"这类细节状态压成"在途"，让买家看到的轨迹迟钝一大截。
 *
 * <p>两个都不命中时返回 {@link Optional#empty()}：<b>宁可不落这条节点，也不猜</b>。
 * 猜错会把状态带到错误的地方（且单调推进后不可回退），少一条节点只是轨迹不够细。
 * 关键词表是尽力而为的启发式，不是协议——扩表先看真实推送样本，别凭想象加词。
 */
public final class TrackingNormalizer {

    /**
     * 文本关键词表，<b>顺序即优先级</b>：越具体的信号排越前。
     * 例如"已签收，签收人：本人"同时含"签收"，而"派送中，预计今日签收"含"签收"却也含"派送"——
     * 前者应判签收、后者应判派送，故"派送"必须排在"签收"之前。
     */
    private static final List<Map.Entry<String, TrackingNodeCode>> KEYWORDS = List.of(
            Map.entry("派送", TrackingNodeCode.OUT_FOR_DELIVERY),
            Map.entry("派件", TrackingNodeCode.OUT_FOR_DELIVERY),
            Map.entry("退回", TrackingNodeCode.RETURNED),
            Map.entry("拒收", TrackingNodeCode.EXCEPTION),
            Map.entry("问题件", TrackingNodeCode.EXCEPTION),
            Map.entry("滞留", TrackingNodeCode.EXCEPTION),
            Map.entry("签收", TrackingNodeCode.DELIVERED),
            Map.entry("揽收", TrackingNodeCode.PICKED_UP),
            Map.entry("已收件", TrackingNodeCode.PICKED_UP),
            Map.entry("到达", TrackingNodeCode.ARRIVED_HUB),
            Map.entry("离开", TrackingNodeCode.DEPARTED_HUB),
            Map.entry("发出", TrackingNodeCode.DEPARTED_HUB));

    /**
     * 结构化状态兜底（快递鸟 {@code State} 口径）。取值若与该聚合服务的文档有出入，
     * 以对接文档为准——这里只求"粗粒度不丢状态"，细节交给文本关键词。
     */
    private static final Map<String, TrackingNodeCode> RAW_STATES = Map.of(
            "1", TrackingNodeCode.PICKED_UP,
            "2", TrackingNodeCode.ARRIVED_HUB,
            "3", TrackingNodeCode.DELIVERED,
            "4", TrackingNodeCode.EXCEPTION,
            "5", TrackingNodeCode.ARRIVED_HUB,
            "6", TrackingNodeCode.ARRIVED_HUB,
            "7", TrackingNodeCode.RETURNED);

    private TrackingNormalizer() {}

    /**
     * 归一化一条原始轨迹。
     *
     * @param rawState 承运商结构化状态（可空；空则只看文本）
     * @param description 承运商原始描述（可空）
     * @return 归一化节点码；两个信号都无法判定时为空（调用方跳过，不猜）
     */
    public static Optional<TrackingNodeCode> normalize(String rawState, String description) {
        // 1. 细粒度文本优先：一句话里的"派送/签收/揽收"比粗状态码精确得多
        if (description != null && !description.isBlank()) {
            for (Map.Entry<String, TrackingNodeCode> keyword : KEYWORDS) {
                if (description.contains(keyword.getKey())) {
                    return Optional.of(keyword.getValue());
                }
            }
        }
        // 2. 粗状态兜底
        return rawState == null ? Optional.empty() : Optional.ofNullable(RAW_STATES.get(rawState.trim()));
    }
}
