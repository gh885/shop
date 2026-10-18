package com.shop.platform.logistics.sandbox;

import com.shop.platform.logistics.service.CarrierTrackingNode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 沙箱轨迹时间线 —— 把一个包裹「此刻本该走到哪一步」算成一批承运商原始节点。
 *
 * <p><b>纯函数</b>：无状态、无 IO、不碰数据库。给定包裹与当前时刻，输出「此刻之前该发生的节点」。
 *
 * <p><b>整条时间线是确定性的</b>，这不是风格问题而是正确性前提：去重键是
 * （包裹 + 节点码 + 时刻 + 地点），如果每次调用都摇一次随机数，同一个节点每轮都会换一个时刻，
 * 去重当场失效、轨迹会一轮一轮地膨胀。所以"每个包裹不一样"靠的是<b>用运单号派生种子</b>——
 * 差异是真的，但对同一个运单号永远一致。
 *
 * <p>差异化的四个维度：<b>各单节奏</b>（±25% 抖动）、<b>承运商</b>（顺丰 24h / 极兔 48h）、
 * <b>地名</b>（始发城市取包裹上真实的寄件城市，目的分拨按种子选）、<b>签收方式</b>（本人/门卫/快递柜/驿站）。
 *
 * <p>出参刻意是 {@link CarrierTrackingNode}（承运商原始形态）而不是领域词表：它必须再走一遍
 * {@code TrackingNormalizer} 那条真实的翻译路径，否则沙箱验的就不是生产那条链了。
 * 文案里出现的关键词就是归一化的判据，改一个词就可能换一种事实——{@code SandboxTimelineTest} 逐条钉住。
 */
public final class SandboxTimeline {

    /**
     * 要模拟的包裹（只取时间线需要的四样，刻意不传整个 mapper 实体）。
     *
     * @param shippedAt 交寄时刻，空表示还没交寄（没有"发出多久"这个量，时间线无从算起）
     * @param carrierCode 承运商字典 code，决定基础时长
     * @param trackingNo 运单号，作为确定性种子（同一单永远同一套轨迹参数）
     * @param originCity 寄件城市（包裹上的真实快照），空则由种子选一个
     */
    public record Parcel(OffsetDateTime shippedAt, String carrierCode, String trackingNo, String originCity) {}

    /** 时间线上的一步：「占总时长的比例」→ 承运商那句话 */
    private record Step(double fraction, String rawState, String description, String location) {}

    /** 目的分拨城市池：只作展示变化，不对应真实收货地址（真实地址没有跨模块取，见类注释） */
    private static final List<String> HUBS = List.of("上海", "广州", "北京", "成都", "武汉", "西安", "南京", "郑州");

    /**
     * 签收方式的几种说法，五种都含"签收"二字——归一化靠关键词，漏了就整条轨迹少一个终点。
     * 末一条刻意带上真实文案里常见的"派件员"句式：归一化的关键词顺序回退时它会立刻变回"派送中"，
     * 由 SandboxTimelineTest 与 TrackingNormalizerTest 双向钉住。
     */
    private static final List<String> SIGNOFFS = List.of(
            "快件已签收，签收人：本人",
            "快件已签收，签收人：门卫代收",
            "快件已签收，已放入快递柜，取件码 2-1-0638",
            "快件已签收，已放至菜鸟驿站，请及时领取",
            "快件已签收，签收人：本人，派件员：王师傅 138****1234");

    private SandboxTimeline() {}

    /**
     * 此刻之前该发生的全部节点，按发生时间升序（调用方直接拿去落库即可）。
     *
     * <p>空列表的三种情形都是正常语义，不是错误：还没到第一个节点、包裹没交寄、时钟回拨。
     *
     * @param accelerated true = 演示节奏，总时长压到 30 秒
     * @param flaky true = 允许异常分支（约 15% 的包裹会在派送阶段滞留一次、签收延后）
     */
    public static List<CarrierTrackingNode> nodesAt(
            Parcel parcel, OffsetDateTime now, boolean accelerated, boolean flaky) {
        if (parcel.shippedAt() == null || now.isBefore(parcel.shippedAt())) {
            return List.of();
        }
        Duration total = totalOf(parcel, accelerated);
        return timeline(parcel, flaky).stream()
                .map(step -> new CarrierTrackingNode(
                        step.rawState(),
                        step.description(),
                        step.location(),
                        parcel.shippedAt()
                                .plus(total.multipliedBy(Math.round(step.fraction() * 100))
                                        .dividedBy(100))))
                .filter(node -> !node.occurredAt().isAfter(now))
                .toList();
    }

    /**
     * 这一单会不会走异常分支（约 15%）。
     *
     * <p>公开出来是为了让调用方能解释「为什么这单没按时签收」，也让测试能确定性地挑出一个异常单。
     */
    public static boolean isFlaky(String trackingNo) {
        return seedOf(trackingNo) % 100 < 15;
    }

    // ---- 内部：时间线装配 ----

    private static List<Step> timeline(Parcel parcel, boolean flaky) {
        long seed = seedOf(parcel.trackingNo());
        String origin = originOf(parcel.originCity(), seed);
        String dest = destOf(origin, seed);
        // 只有开关打开、且这一单被种子选中时才有异常分支：开关关着时所有单都顺利签收
        boolean delayed = flaky && isFlaky(parcel.trackingNo());

        List<Step> steps = new ArrayList<>();
        steps.add(new Step(0.07, "1", "快件已揽收", origin + "收寄网点"));
        steps.add(new Step(0.25, "2", "快件到达【" + origin + "转运中心】", origin + "转运中心"));
        steps.add(new Step(0.37, "2", "快件离开【" + origin + "转运中心】，发往【" + dest + "转运中心】", origin + "转运中心"));
        steps.add(new Step(0.62, "2", "快件到达【" + dest + "转运中心】", dest + "转运中心"));
        if (delayed) {
            // "滞留"落在关键词表里，归一成 EXCEPTION；它不推进包裹状态（异常只落轨迹），
            // 所以这单会正常地晚一点签收，而不是卡死在待收货
            steps.add(new Step(0.72, "4", "快件滞留【" + dest + "转运中心】，因收件人不在，次日重派", dest + "转运中心"));
        }
        steps.add(new Step(0.82, "2", "快件正在派送途中，请保持电话畅通", dest + "派送网点"));
        // 异常单签收延后 20%，让"迟到"这件事在数据上成立
        steps.add(new Step(delayed ? 1.20 : 1.00, "3", signoff(seed), dest + "派送网点"));
        return steps;
    }

    /** 基础总时长 × 种子抖动（0.75 ~ 1.25）。抖动是"每个包裹不一样"的主来源 */
    private static Duration totalOf(Parcel parcel, boolean accelerated) {
        Duration base = accelerated ? Duration.ofSeconds(30) : Duration.ofHours(baseHours(parcel.carrierCode()));
        double factor = 0.75 + (seedOf(parcel.trackingNo()) % 51) / 100.0;
        return Duration.ofMillis(Math.round(base.toMillis() * factor));
    }

    /**
     * 承运商节奏（小时）：顺丰/京东快、极兔/EMS 慢。
     *
     * <p>这不是给真实承运商立档，只是让不同 carrierCode 的轨迹不要长成一个样。
     */
    private static int baseHours(String carrierCode) {
        return switch (carrierCode == null ? "" : carrierCode.toUpperCase(Locale.ROOT)) {
            case "SF", "JD" -> 24;
            case "ZTO", "YTO" -> 36;
            case "STO" -> 40;
            case "YD" -> 42;
            case "JT", "EMS" -> 48;
            default -> 36;
        };
    }

    /** 始发城市：优先用包裹上真实的寄件城市，没有就按种子挑一个（保证同一单稳定） */
    private static String originOf(String originCity, long seed) {
        String city = stripCitySuffix(originCity);
        return city != null ? city : HUBS.get((int) (seed % HUBS.size()));
    }

    /** 目的分拨：按种子从城市池里挑一个，且不与始发相同（同城对发看着就不像真的） */
    private static String destOf(String origin, long seed) {
        List<String> candidates =
                HUBS.stream().filter(hub -> !hub.equals(origin)).toList();
        return candidates.get((int) ((seed / 7) % candidates.size()));
    }

    private static String signoff(long seed) {
        return SIGNOFFS.get((int) ((seed / 13) % SIGNOFFS.size()));
    }

    /** "杭州市" → "杭州"。只处理最常见的那几种后缀，多一个字都不猜 */
    private static String stripCitySuffix(String city) {
        if (city == null || city.isBlank()) {
            return null;
        }
        String trimmed = city.trim();
        for (String suffix : List.of("市", "地区", "自治州")) {
            if (trimmed.endsWith(suffix) && trimmed.length() > suffix.length()) {
                return trimmed.substring(0, trimmed.length() - suffix.length());
            }
        }
        return trimmed;
    }

    private static long seedOf(String trackingNo) {
        return trackingNo == null ? 0 : Integer.toUnsignedLong(trackingNo.hashCode());
    }
}
