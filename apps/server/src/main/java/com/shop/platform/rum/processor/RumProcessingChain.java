package com.shop.platform.rum.processor;

import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * 加工链：把 {@link RumProcessor} 按 {@code @Order} 依次跑一遍，中途被谁否决就在谁那儿停下。
 *
 * <p>为什么要有这么一个壳，而不是让消费端直接 for 一遍：**顺序与短路是这条链唯一的语义**，
 * 它值得一个能单独写测试的住所。顺序错了（先脱敏后校验、或干脆反着来）不会报任何错，
 * 只会让一部分事件落到落点时已经带上了本来该被抹掉的东西——那是「看板上数据全对、日志里有号码」
 * 这类事后才发现的问题。
 *
 * <p>{@code @Order} 写在各个加工器身上而不是这里维护一张名单：一张名单在别处就等于
 * 「加一个加工器忘了登记，它静静地不跑」。Spring 按 {@code @Order} 注入，没标的一律排在标了的后面。
 */
@Component
@RequiredArgsConstructor
public class RumProcessingChain {

    /** Spring 按 {@code @Order} 排好序注入（容器里全部 {@link RumProcessor} bean）。顺序即执行顺序 */
    private final List<RumProcessor> processors;

    public Optional<JsonNode> run(JsonNode event) {
        JsonNode current = event;
        for (RumProcessor processor : processors) {
            Optional<JsonNode> next = processor.process(current);
            if (next.isEmpty()) {
                return Optional.empty();
            }
            current = next.get();
        }
        return Optional.of(current);
    }
}
