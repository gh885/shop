package com.shop.platform.rum.processor;

import java.util.Optional;
import tools.jackson.databind.JsonNode;

/**
 * 加工链上的一环：消费端从队列取出一条事件之后、交给落点之前，对这条事件做的最后一次改写或否决。
 *
 * <p><b>为什么这条链在消费端而不在接收端。</b>接收端跑在 HTTP 线程上，它多花一毫秒就是调用方多等一毫秒；
 * 而这里的一次加工再怎么重也只是消费延迟，队列会兜住。判据与接收端「什么留在门口」那条一致
 * （见 {@link com.shop.platform.rum.service.RumIngestService}）：只有「不做就会污染队列」的事
 * 才配占请求线程，其余一律挪到消费端。
 *
 * <p><b>返回空 = 丢弃这条；返回事件 = 放行。</b>加工器**可以原地改写**传进来的节点——它是刚反序列化
 * 出来的，没有第二个持有者——返回值才是链上下一步看到的那个。
 *
 * <p><b>抛异常不算丢弃。</b>它会一路传到消费端，由容器按退避重试，而位点还没提交，所以丢不了。
 * 这条与「返回空」的区别很重要：「这条不该要」是判断，「我这步坏了」是故障——后者要走重试，
 * 当成丢弃就等于「下游抖一下、那批事件静默消失」。
 */
public interface RumProcessor {

    /** 稳定标识，只给人看与排查用（进日志、进测试断言的失败信息） */
    String name();

    /**
     * @return 空表示丢弃这条；否则是放行的那条（可能与入参是同一个对象）
     */
    Optional<JsonNode> process(JsonNode event);
}
