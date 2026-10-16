package com.shop.platform.rum.service;

import com.shop.platform.infra.security.RateLimiter;
import com.shop.platform.rum.RumCounters;
import com.shop.platform.rum.RumProperties;
import com.shop.platform.rum.RumVocabulary;
import jakarta.annotation.PostConstruct;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 接收端的用例：把一批上报**校验到能进队列**，然后交给 {@link RumEventPublisher}。
 *
 * <p>它刻意只做「够把脏数据挡在队列外」的那些事，重活一律留给消费端。分界线的判据是
 * **这一步错了会不会污染队列**：不是数组、超批量、限流命中——这些留在门口；至于字段白名单、
 * 标签归一、去重、落数，那些是加工的事，放在 HTTP 线程上做等于用请求延迟换吞吐。
 *
 * <p>三条口径，每条都对应一个具体的坑：
 *
 * <ol>
 *   <li><b>不信任客户端。</b>接口匿名可达，字段值全来自请求体。这里至少要把 app 过一遍白名单
 *       再当分区键用——否则一条请求就能指定任意分区键（分区是物理资源，键无界就是无界的分区压力）。
 *   <li><b>永不 5xx，永不抛。</b>遥测的失败不能变成客户端的失败。投递失败也不抛：队列不可用时
 *       丢的是遥测，而把 500 回给浏览器没有挽回任何东西，只会让业务页面多一个红字。
 *   <li><b>限流查询失败一律放行</b>（fail-open）：监控设施不可用时拒收遥测，
 *       等于在最需要现场的时候把现场关掉。
 * </ol>
 *
 * <p>还有一条在这一层之上：{@code shop.rum.enabled}（见 {@link RumProperties#isEnabled}）。
 * 关掉时这里最先返回，一个事件都不投——投递层还没有机器的时候，开着它只会制造「看着在跑、
 * 其实一条没留住」的假象。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RumIngestService {

    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redis;
    private final RumEventPublisher publisher;
    private final RumProperties properties;
    private final RumCounters counters;

    /**
     * 关掉时在启动横幅里说一声。**这句话是唯一会告诉人「本环境不收遥测」的地方**：
     * 关掉之后门口就拦下来，投递失败那条曲线也不再涨，于是「一条都没留」这件事
     * 除了配置之外没有任何痕迹。开机说一句，比事后有人对着空看板猜要强。
     */
    @PostConstruct
    void announceIfDisabled() {
        if (!properties.isEnabled()) {
            log.warn("[RUM] 遥测接收已关闭（shop.rum.enabled=false）：上报照收、204 照回，但一条都不留");
        }
    }

    /** 入口。任何异常都不外抛——见类注释第 2 条 */
    public void ingest(String body, String clientIp) {
        // 关掉时最先返回：连限流都不查。**不计 rejected**——那些计数是「客户端违规」的证据，
        // 混进一个「本环境本来就不收」进去，从此每条告警都得先排除它
        if (!properties.isEnabled()) {
            return;
        }
        try {
            if (rateLimited(clientIp)) {
                return;
            }
            JsonNode batch = objectMapper.readTree(body);
            if (batch == null || !batch.isArray()) {
                counters.rejected("not_array");
                return;
            }
            if (batch.size() > RumVocabulary.MAX_BATCH) {
                counters.rejected("batch_too_large");
                return;
            }
            batch.forEach(this::publish);
        } catch (Exception ex) {
            // 解析失败、Redis 抛错、任何意外：计一条 rejected 就够了，不打堆栈（对方的解析失败不是我们的故障）
            counters.rejected("bad_body");
        }
    }

    /** 单条：定分区键 → 投递。app 在这里过白名单，因为它是**分区键**（进的是物理资源，不是标签） */
    private void publish(JsonNode event) {
        if (!event.isObject()) {
            counters.rejected("not_object");
            return;
        }
        String app = RumVocabulary.label(RumVocabulary.APPS, RumVocabulary.text(event, "app", RumVocabulary.MAX_LABEL));
        publisher.publish(app, event.toString());
    }

    /**
     * 限流。**查询本身失败一律放行**（fail-open）：监控设施不可用时拒收遥测，
     * 等于在最需要现场的时候把现场关掉。
     */
    private boolean rateLimited(String clientIp) {
        if (clientIp == null || clientIp.isBlank()) {
            return false;
        }
        try {
            if (RateLimiter.exceeded(
                    redis, "rum:ip:" + clientIp, RumVocabulary.RATE_MAX_PER_MINUTE, Duration.ofMinutes(1))) {
                counters.rejected("ip_rate_limited");
                return true;
            }
        } catch (Exception ex) {
            // Redis 不可用：放行。不记 rejected——那是「客户端违规」的计数，混进来会误导
            return false;
        }
        return false;
    }
}
