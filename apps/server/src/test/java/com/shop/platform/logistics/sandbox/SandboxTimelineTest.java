package com.shop.platform.logistics.sandbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.logistics.model.TrackingNodeCode;
import com.shop.platform.logistics.model.TrackingNormalizer;
import com.shop.platform.logistics.service.CarrierTrackingNode;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

/**
 * 沙箱时间线 —— 纯函数，所以能把它当成"事实生成器"逐条钉死。
 *
 * <p>两条最容易写坏的线：
 * <ul>
 *   <li><b>确定性</b>：同一个运单号两次调用必须给出完全相同的时间戳。一旦摇了随机数，
 *       去重键每轮都变，轨迹会一轮一轮地膨胀——所以这条用例是防止将来"顺手指个 Random"。</li>
 *   <li><b>文案与节点码的对应</b>：归一化靠关键词判，改一个字（比如把"快件已揽收"写成"已收货"）
 *       就会静默变成另一种事实，而模拟器照样跑、日志照样好看。</li>
 * </ul>
 */
class SandboxTimelineTest {

    private static final OffsetDateTime SHIPPED_AT = OffsetDateTime.parse("2026-10-18T09:00:00+08:00");

    /** 挑了三个固定运单号，覆盖"有寄件城市 / 没寄件城市"两种入参 */
    private static SandboxTimeline.Parcel parcel(String trackingNo) {
        return new SandboxTimeline.Parcel(SHIPPED_AT, "ZTO", trackingNo, "杭州市");
    }

    @Test
    void 刚交寄_还没有任何轨迹() {
        assertThat(SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT, false, false))
                .isEmpty();
        assertThat(SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT.plusMinutes(10), false, false))
                .isEmpty();
    }

    @Test
    void 未交寄的包裹_没有时间线可算() {
        SandboxTimeline.Parcel notShipped = new SandboxTimeline.Parcel(null, "ZTO", "77300000000001", "杭州市");
        assertThat(SandboxTimeline.nodesAt(notShipped, SHIPPED_AT, false, false))
                .isEmpty();
        // 时钟回拨（now 早于交寄）同样算"还没发生"：不产出未来节点，否则会出现未卜先知的轨迹
        assertThat(SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT.minusMinutes(1), false, false))
                .isEmpty();
    }

    @Test
    void 同一运单号反复调用_时间戳完全一致() {
        List<CarrierTrackingNode> first =
                SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT.plusDays(3), false, true);
        List<CarrierTrackingNode> second =
                SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT.plusDays(3), false, true);

        assertThat(first).hasSizeGreaterThanOrEqualTo(6);
        assertThat(first.stream().map(CarrierTrackingNode::occurredAt).toList())
                .isEqualTo(second.stream().map(CarrierTrackingNode::occurredAt).toList());
    }

    @Test
    void 不同运单号_节奏不同() {
        List<CarrierTrackingNode> one =
                SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT.plusDays(3), false, false);
        List<CarrierTrackingNode> other =
                SandboxTimeline.nodesAt(parcel("77300000000009"), SHIPPED_AT.plusDays(3), false, false);

        assertThat(one.getLast().occurredAt()).isNotEqualTo(other.getLast().occurredAt());
    }

    @Test
    void 承运商不同_时长不同_顺丰快于极兔() {
        // 同一个运单号 = 同一个抖动因子，差别只来自承运商节奏
        OffsetDateTime shipped = SHIPPED_AT;
        var fast = SandboxTimeline.nodesAt(
                new SandboxTimeline.Parcel(shipped, "SF", "77300000000001", "杭州市"), shipped.plusDays(3), false, false);
        var slow = SandboxTimeline.nodesAt(
                new SandboxTimeline.Parcel(shipped, "JT", "77300000000001", "杭州市"), shipped.plusDays(3), false, false);

        assertThat(fast.getLast().occurredAt()).isBefore(slow.getLast().occurredAt());
    }

    @Test
    void 加速模式_小时换成秒() {
        assertThat(SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT.plusSeconds(1), true, false))
                .isEmpty();
        assertThat(SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT.plusSeconds(40), true, false))
                .hasSizeGreaterThanOrEqualTo(6);
    }

    @Test
    void 异常分支_滞留一次且签收延后() {
        String flakyNo = IntStream.rangeClosed(1, 300)
                .mapToObj(index -> "77300000" + index)
                .filter(SandboxTimeline::isFlaky)
                .findFirst()
                .orElseThrow(() -> new AssertionError("种子池里没有异常单，isFlaky 的判据可能写错了"));
        SandboxTimeline.Parcel target = parcel(flakyNo);

        List<CarrierTrackingNode> withFlaky = SandboxTimeline.nodesAt(target, SHIPPED_AT.plusDays(5), false, true);
        List<CarrierTrackingNode> without = SandboxTimeline.nodesAt(target, SHIPPED_AT.plusDays(5), false, false);

        assertThat(withFlaky.stream().map(node -> TrackingNormalizer.normalize(node.rawState(), node.description())
                        .orElseThrow()))
                .contains(TrackingNodeCode.EXCEPTION);
        // 滞留之后仍要签收：异常分支是"晚到"，不是"卡死"——卡死的单演示起来像 bug
        assertThat(withFlaky.getLast().occurredAt()).isAfter(without.getLast().occurredAt());
        assertThat(TrackingNormalizer.normalize(
                        withFlaky.getLast().rawState(), withFlaky.getLast().description()))
                .contains(TrackingNodeCode.DELIVERED);
    }

    @Test
    void 每条文案都能被归一化成预期节点码() {
        List<CarrierTrackingNode> nodes =
                SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT.plusDays(3), false, false);

        assertThat(nodes.stream()
                        .map(node -> TrackingNormalizer.normalize(node.rawState(), node.description())
                                .orElseThrow(() -> new AssertionError("文案无法归一化：" + node.description())))
                        .toList())
                .containsExactly(
                        TrackingNodeCode.PICKED_UP,
                        TrackingNodeCode.ARRIVED_HUB,
                        TrackingNodeCode.DEPARTED_HUB,
                        TrackingNodeCode.ARRIVED_HUB,
                        TrackingNodeCode.OUT_FOR_DELIVERY,
                        TrackingNodeCode.DELIVERED);
    }

    @Test
    void 轨迹按时间升序_且地名随包裹变化() {
        List<CarrierTrackingNode> nodes =
                SandboxTimeline.nodesAt(parcel("77300000000001"), SHIPPED_AT.plusDays(3), false, false);

        assertThat(nodes).isSortedAccordingTo(Comparator.comparing(CarrierTrackingNode::occurredAt));
        // 始发城市来自包裹上的寄件城市快照（"杭州市" → "杭州"），不是硬编码
        assertThat(nodes.getFirst().location()).startsWith("杭州");
    }

    @Test
    void 签收文案含派件员句式_每一条都判签收() {
        // 五种签收说法里有一条"派件员"句式（真实文案的常见形态）：从运单号池里实际取出来验，
        // 保证它真的会被用到、且不会被归一化的关键词顺序判成"派送中"
        var delivered = IntStream.rangeClosed(1, 300)
                .mapToObj(index -> SandboxTimeline.nodesAt(
                                parcel("77310000" + index), SHIPPED_AT.plusDays(5), false, false)
                        .getLast())
                .toList();

        assertThat(delivered.stream()
                        .map(CarrierTrackingNode::description)
                        .distinct()
                        .toList())
                .anySatisfy(desc -> assertThat(desc).contains("派件员"));
        assertThat(delivered)
                .allSatisfy(node -> assertThat(TrackingNormalizer.normalize(node.rawState(), node.description()))
                        .contains(TrackingNodeCode.DELIVERED));
    }
}
