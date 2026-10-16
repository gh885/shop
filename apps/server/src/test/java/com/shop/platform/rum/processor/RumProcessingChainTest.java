package com.shop.platform.rum.processor;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * 链的语义只有两条：**顺序**与**短路**。
 *
 * <p>两条都是「错了不报错、只是结果不对」的那种：顺序反了（先归一后脱敏之类）结果照样是
 * 一条合法事件，只是某个字段没被处理；短路漏了（被否决还继续往下跑）则让后面的加工器
 * 在一个本该被丢掉的节点上做事。
 */
class RumProcessingChainTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 按注入顺序依次执行() {
        List<String> ran = new ArrayList<>();
        RumProcessingChain chain = new RumProcessingChain(
                List.of(new Recorder("一", ran, false), new Recorder("二", ran, false), new Recorder("三", ran, false)));

        assertThat(chain.run(mapper.readTree("{}"))).isPresent();
        assertThat(ran).containsExactly("一", "二", "三");
    }

    @Test
    void 中途被否决_后面的不再跑_结果为空() {
        List<String> ran = new ArrayList<>();
        RumProcessingChain chain = new RumProcessingChain(
                List.of(new Recorder("一", ran, false), new Recorder("二", ran, true), new Recorder("三", ran, false)));

        assertThat(chain.run(mapper.readTree("{}"))).isEmpty();
        assertThat(ran).containsExactly("一", "二");
    }

    /** 交付给下一环的是返回值，不是入参——加工器就是靠这个改写事件的 */
    @Test
    void 上一环的改写传到下一环() {
        Reader reader = new Reader("读", "message");
        RumProcessingChain chain = new RumProcessingChain(List.of(new Rewriter("改", "message", "已改写"), reader));

        assertThat(chain.run(mapper.readTree("{\"message\":\"原样\"}"))).isPresent();
        assertThat(reader.seen).isEqualTo("已改写");
    }

    @Test
    void 空链原样放行() {
        RumProcessingChain chain = new RumProcessingChain(List.of());

        assertThat(chain.run(mapper.readTree("{\"a\":1}"))).isPresent();
    }

    private record Recorder(String name, List<String> ran, boolean veto) implements RumProcessor {
        @Override
        public Optional<JsonNode> process(JsonNode event) {
            ran.add(name);
            return veto ? Optional.empty() : Optional.of(event);
        }
    }

    /** 记下它看到的值，用来验「上一环的改写传到了下一环」 */
    private static final class Reader implements RumProcessor {
        private final String name;
        private final String field;

        Reader(String name, String field) {
            this.name = name;
            this.field = field;
        }

        @Override
        public String name() {
            return name;
        }

        @Override
        public Optional<JsonNode> process(JsonNode event) {
            seen = event.path(field).asString();
            return Optional.of(event);
        }

        String seen;
    }

    private static final class Rewriter implements RumProcessor {
        private final String name;
        private final String field;
        private final String value;

        Rewriter(String name, String field, String value) {
            this.name = name;
            this.field = field;
            this.value = value;
        }

        @Override
        public String name() {
            return name;
        }

        @Override
        public Optional<JsonNode> process(JsonNode event) {
            ((ObjectNode) event).put(field, value);
            return Optional.of(event);
        }
    }
}
