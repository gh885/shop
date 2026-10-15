package com.shop.platform.rum.service;

/**
 * 投递口：接收端把校验过的事件交给它，由它负责「送到加工那一步」。
 *
 * <p>为什么要这一层接口，而不是让接收端直接注入 {@code KafkaTemplate}：
 *
 * <ol>
 *   <li><b>接收端不该认识队列。</b>它对调用方的承诺是「永远 204，且不等下游」——下游是 Kafka、
 *       是别的队列、还是当天根本没有下游，都不改变这个承诺。把 KafkaTemplate 注进接收端，
 *       换传输就要动接收端。
 *   <li><b>投递失败必须有明确归属。</b>队列不可用时事件是**丢**的，而这件事发生在哪一层、
 *       记在哪个计数上，要有个说得清的地方。它就是这里。
 * </ol>
 */
public interface RumEventPublisher {

    /**
     * 投递一条事件。**不阻塞调用方**：接收端在 HTTP 线程上调它，它必须立刻返回。
     *
     * @param app 分区键，已过白名单。同一端的事件落同一分区，分区内有序
     * @param eventJson 事件的 JSON 串
     */
    void publish(String app, String eventJson);
}
