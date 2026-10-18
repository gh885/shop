package com.shop.platform.logistics;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.logistics.model.TrackingNodeCode;
import com.shop.platform.logistics.model.TrackingNormalizer;
import org.junit.jupiter.api.Test;

/**
 * 轨迹归一化（对真实承运商文本的翻译）—— 这是"原始码不进领域"那条规矩最容易被写错的地方，
 * 所以逐条钉死：细粒度文本优先于粗状态、关键词内部有优先级、判不出来就不猜。
 */
class TrackingNormalizerTest {

    @Test
    void 文本优先于粗状态_粗状态只有在文本无信号时才用() {
        // 粗状态说"在途"（2），但文本已经到"派送中"：细节不该被粗状态压回去
        assertThat(TrackingNormalizer.normalize("2", "快件已到达上海浦东网点，派送中")).contains(TrackingNodeCode.OUT_FOR_DELIVERY);
    }

    @Test
    void 派送优先于签收_派送预告里的签收字样不算签收() {
        // "预计今日签收"含"签收"，但这条讲的是派送——顺序错了会把包裹提前判成已签收
        assertThat(TrackingNormalizer.normalize("2", "您的快件正在派送，预计今日签收")).contains(TrackingNodeCode.OUT_FOR_DELIVERY);
    }

    @Test
    void 真签收_判签收() {
        assertThat(TrackingNormalizer.normalize("3", "已签收，签收人：本人，感谢使用")).contains(TrackingNodeCode.DELIVERED);
    }

    @Test
    void 揽收与中转_各归其位() {
        assertThat(TrackingNormalizer.normalize("1", "杭州西湖网点已揽收")).contains(TrackingNodeCode.PICKED_UP);
        assertThat(TrackingNormalizer.normalize("2", "快件已到达【杭州转运中心】")).contains(TrackingNodeCode.ARRIVED_HUB);
        assertThat(TrackingNormalizer.normalize("2", "快件已离开【杭州转运中心】，发往上海")).contains(TrackingNodeCode.DEPARTED_HUB);
    }

    @Test
    void 退回与异常_各有归属() {
        assertThat(TrackingNormalizer.normalize("7", "买家拒收，快件退回")).contains(TrackingNodeCode.RETURNED);
        assertThat(TrackingNormalizer.normalize("4", "快件在【上海转运中心】滞留")).contains(TrackingNodeCode.EXCEPTION);
    }

    @Test
    void 粗状态兜底_文本无关键词时按结构化状态判() {
        assertThat(TrackingNormalizer.normalize("3", "【上海浦东网点】")).contains(TrackingNodeCode.DELIVERED);
        assertThat(TrackingNormalizer.normalize("1", "【杭州西湖网点】")).contains(TrackingNodeCode.PICKED_UP);
    }

    @Test
    void 两个信号都判不出来_不猜_返回空() {
        assertThat(TrackingNormalizer.normalize(null, "客官您好")).isEmpty();
        assertThat(TrackingNormalizer.normalize(null, null)).isEmpty();
        assertThat(TrackingNormalizer.normalize("0", "无轨迹信息")).isEmpty();
    }

    @Test
    void 签收句带派件员_仍判签收_别被派件二字劫走() {
        // 真实签收文案常附派件员与电话；"派件"排在"签收"之前时这类句子会被判成派送中，包裹永远等不到签收
        assertThat(TrackingNormalizer.normalize("3", "快件已签收，签收人：本人，派件员：王师傅 138****1234"))
                .contains(TrackingNodeCode.DELIVERED);
    }

    @Test
    void 派送句带派件员_仍判派送_已签收优先不影响派送预告() {
        assertThat(TrackingNormalizer.normalize("2", "快件正在派送中（派件员：张三 138****1234）"))
                .contains(TrackingNodeCode.OUT_FOR_DELIVERY);
        assertThat(TrackingNormalizer.normalize("2", "您的快件正在派送，预计今日签收")).contains(TrackingNodeCode.OUT_FOR_DELIVERY);
    }
}
