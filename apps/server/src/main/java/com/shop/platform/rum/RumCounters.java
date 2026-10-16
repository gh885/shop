package com.shop.platform.rum;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 遥测链路自己的计数器：名字与记账口集中一处。
 *
 * <p>集中是因为**指标名是契约**——散在接收端与消费端各写一份字符串，改名时会漏掉一处，
 * 而症状是那条曲线悄悄变成 0，没有任何报错。
 *
 * <p>用**注入的注册表**而不是 {@code Metrics.globalRegistry}：全局那个是
 * {@code CompositeMeterRegistry}，没有子注册表时 {@code count()} 恒为 0——Spring 上下文里
 * 有 Prometheus 注册表挂着才有效果。依赖全局等于「这段代码只有在被别人装好注册表时才可测」，
 * 而它的单测正是最该好写的那一类（纯函数式的记账）。
 */
@Component
@RequiredArgsConstructor
public class RumCounters {

    private final MeterRegistry registry;

    /**
     * 拒收计数。**状态码不是这条链路的反馈通道，指标才是**——遥测没有重试语义，把脏数据或
     * 限流做成 429/400 只会在网关日志里堆一堆没人处理的错误，把真故障淹掉。
     *
     * @param reason 有界枚举：not_array / batch_too_large / not_object / bad_body / ip_rate_limited /
     *               schema_unknown
     */
    public void rejected(String reason) {
        Counter.builder("shop.rum.rejected")
                .tag("reason", reason)
                .register(registry)
                .increment();
    }

    /**
     * 投递失败计数。**这条曲线是「我们正在丢遥测」的唯一信号**。
     *
     * <p>它必须存在，因为那条链路的失败是**静默**的：接收端永远回 204（那是它对调用方的承诺），
     * 客户端不看响应也不会重试，所以队列不可用这件事，除了这个计数之外没有任何地方会说。
     */
    public void publishFailed() {
        Counter.builder("shop.rum.publish.failed").register(registry).increment();
    }

    /**
     * 脱敏命中计数。**它不是接收端的故障指标，是前端契约被违反的证据**：这条在涨，
     * 说明有调用方把用户数据塞进了 message / detail / stack 这类自由文本——
     * 该改的是那个调用方，不是这里。
     *
     * <p>标签是**规则名**而不是字段名：字段名由客户端给（键名随便起），进标签就是无界基数；
     * 规则名是我们自己那几条，天然有界。
     *
     * @param rule 有界枚举：phone / email / id_card / token
     */
    public void redacted(String rule) {
        Counter.builder("shop.rum.redacted")
                .tag("rule", rule)
                .register(registry)
                .increment();
    }
}
