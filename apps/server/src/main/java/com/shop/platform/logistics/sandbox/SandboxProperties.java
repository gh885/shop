package com.shop.platform.logistics.sandbox;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 开发期轨迹模拟器的开关。默认全关——没打开时整个 sandbox 包里的 bean 一个都不装配。
 *
 * <p>与快递鸟走的是同一条哲学：<b>缺配置不影响启动</b>，只是没这个能力。区别在于这里的默认值是
 * 「关」而不是「开」：模拟器产的是<b>伪造的物流事实</b>，一旦进了生产库，包裹会凭空签收、
 * 订单会凭空完成、对账会凭空对不上。所以它的安全边界不是"别开"，而是"在生产的 profile 下开了就起不来"
 * （见 {@link SandboxTrackingSimulator#refuseToRunInProduction}）。
 */
@Data
@ConfigurationProperties(prefix = "shop.logistics.sandbox")
public class SandboxProperties {

    /** 是否启用。生产 profile 下置 true 会让应用启动失败 */
    private boolean enabled;

    /**
     * 演示节奏：把时间线的「小时」换成「秒」，2 秒揽收、30 秒签收。
     *
     * <p>给客户演示时点进订单能看到包裹真的在动，而不是干等两个小时。
     */
    private boolean accelerated;

    /**
     * 异常分支：约 15% 的包裹会在派送阶段滞留一次、签收延后 20%。
     *
     * <p>默认<b>关</b>。打开后演示时可能撞上一单"卡住了"——这不是 bug，是真实物流的样子；
     * 但第一次演示想要顺顺当当走完，就别开。
     */
    private boolean flaky;

    /** 单轮最多处理多少个包裹：本地开发库里躺着的历史在途单不该被一次性全捞出来 */
    private int batchLimit = 20;
}
