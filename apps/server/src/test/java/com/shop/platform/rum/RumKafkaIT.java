package com.shop.platform.rum;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.shop.platform.rum.service.RumEventPublisher;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 真 broker 上跑一遍：投出去的事件能被自己的消费端取回并落到计数上。
 *
 * <p>为什么非要有这一条，而不是「投递口的单测 + 消费端的单测拼起来就够了」：那两条都在
 * **绕开 Kafka 本身**——投递口被 mock 的时候，topic 名、分区键、消费组、序列化、位点提交
 * 一个都没被验过。而它们错了的症状是「页面一切正常、看板上那条线永远是 0」，
 * 没有任何一处会报错。**这条链路里唯一会无声骗人的就是这一段。**
 *
 * <p>没有 broker 就跳过（本机用 {@code deploy/kafka.compose.yml} 起）。这是刻意的：
 * CI 现在没有 broker，而「跳过并说明为什么」比「假装验过」诚实——跳过时那句 reason
 * 会进 surefire 报告，谁都能看见这条没跑。
 *
 * <p>它开的是一个**独立的 Spring 上下文**（{@code consumer-enabled=true}，与应用里测试基座
 * 的 {@code application-test.yml} 相反），所以比别的 IT 慢几秒。值得。
 */
@SpringBootTest(properties = "shop.rum.consumer-enabled=true")
@ActiveProfiles("test")
class RumKafkaIT {

    @Autowired
    private RumEventPublisher publisher;

    @Autowired
    private MeterRegistry registry;

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;

    @BeforeEach
    void 需要可达的broker() {
        assumeTrue(brokerReachable(), "本机没有 Kafka broker（docker compose -f deploy/kafka.compose.yml up -d），跳过这条真链路验证");
    }

    @Test
    void 投出去的事件被消费端取回并落到错误计数上() throws Exception {
        double before = errorCount("web", "js_error");

        publisher.publish("web", "{\"kind\":\"error\",\"app\":\"web\",\"name\":\"js_error\",\"message\":\"kafka-it\"}");

        assertThat(awaitMoreThan("web", "js_error", before) - before)
                .as("事件没走完「投递 → broker → 消费 → 落数」。这一格红了通常意味着 topic 名 / 分区 / 消费组 / 序列化里有一处对不上")
                .isEqualTo(1.0);
    }

    /**
     * app 是消息键、也是分区键：投出去之后落到计数上的 app 必须是投时那个，
     * 而不是事件体里自述的那个（体里那个是客户端的话，不可信）。
     */
    @Test
    void 落在标签上的app取自消息键而非事件体() throws Exception {
        double before = errorCount("seller", "route_error");

        // 体里故意写 web，键是 seller：落点应该按 seller 记
        publisher.publish(
                "seller", "{\"kind\":\"error\",\"app\":\"web\",\"name\":\"route_error\",\"message\":\"kafka-it\"}");

        assertThat(awaitMoreThan("seller", "route_error", before) - before).isEqualTo(1.0);
    }

    private double awaitMoreThan(String app, String name, double before) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        double current = before;
        while (System.nanoTime() < deadline) {
            current = errorCount(app, name);
            if (current > before) {
                return current;
            }
            Thread.sleep(100);
        }
        return current;
    }

    private double errorCount(String app, String name) {
        Counter counter =
                registry.find("shop.rum.errors").tags("app", app, "name", name).counter();
        return counter == null ? 0 : counter.count();
    }

    private boolean brokerReachable() {
        String[] hostPort = bootstrapServers.split(",")[0].split(":");
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(hostPort[0], Integer.parseInt(hostPort[1])), 500);
            return true;
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }
}
