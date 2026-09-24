package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/**
 * 扫描逐笔隔离的单测（快环）：{@link Sweep} 的计数与不中断，加两条「注释里的宣称别成为假话」的核对。
 *
 * <p>这里不连库，所以验的是机制而不是某条超时线的业务规则（那些归各自的 IT）。
 * 失败日志本身不在断言范围内：日志只在真出事时才有内容，快环里接住 appender 的代价不值它的信号量。
 */
class SweepTest {

    private static final org.slf4j.Logger LOGGER = LoggerFactory.getLogger(SweepTest.class);

    private record Row(String id, boolean boom) {}

    private static final List<Row> BATCH = List.of(new Row("a", false), new Row("b", true), new Row("c", false));

    @Test
    void 一笔抛异常不中断整批_后面的行照样跑() {
        List<String> visited = new ArrayList<>();
        int handled = Sweep.each(LOGGER, "测试线", BATCH, Row::id, row -> {
            visited.add(row.id());
            if (row.boom()) {
                throw new IllegalStateException("第 2 笔炸了");
            }
            return true;
        });

        assertThat(visited).as("失败的 b 之后的 c 必须还跑到（队首一行不该卡死整批）").containsExactly("a", "b", "c");
        assertThat(handled).as("落成数只算真改到的两笔").isEqualTo(2);
    }

    @Test
    void 让位不计但也不失败() {
        int handled = Sweep.each(LOGGER, "测试线", BATCH, Row::id, row -> !row.boom());
        assertThat(handled).as("false＝条件更新没抢到，不算失败也不计数").isEqualTo(2);
    }

    @Test
    void 整批都失败也只是返回零_不把异常抛给调度线程() {
        assertThatCode(() -> {
                    int handled = Sweep.each(LOGGER, "测试线", BATCH, Row::id, row -> {
                        throw new IllegalStateException("全炸");
                    });
                    assertThat(handled).isZero();
                })
                .doesNotThrowAnyException();
    }

    @Test
    void 空批直接返回零() {
        assertThat(Sweep.each(LOGGER, "测试线", List.of(), Row::id, row -> true)).isZero();
    }

    @Test
    void 三条超时线都真的走了隔离而不是各自写循环() throws IOException {
        for (String service : List.of(
                "aftersale/service/AfterSaleTimeoutService.java",
                "order/service/OrderTimeoutService.java",
                "account/service/AccountDeletionService.java")) {
            String code = codeOf(service);
            assertThat(code).as("%s 应当把逐笔循环交给 Sweep", service).contains("Sweep.each(");
            assertThat(INTERRUPTIBLE_LOOP.matcher(code).find())
                    .as("%s 里又出现了不带隔离的逐笔落点循环：一行失败就会卡住整条线", service)
                    .isFalse();
        }
    }

    @Test
    void 售后批上限与订单侧同值是注释宣称的那件事() throws IOException {
        assertThat(batchLimit("aftersale/service/AfterSaleTimeoutService.java"))
                .as("AfterSaleTimeoutService 的注释写着「与订单侧同值」")
                .isEqualTo(batchLimit("order/service/OrderTimeoutService.java"));
    }

    /** 逐笔落点的循环长这样：拿到一批行后直接 {@code if (xxx.handle(...))} 计数。加了隔离就不该再出现 */
    private static final Pattern INTERRUPTIBLE_LOOP =
            Pattern.compile("for \\([^:]+ : (expired|due|stale|rows)\\) \\{\\s*if \\(");

    private static String codeOf(String relative) throws IOException {
        Path path = Path.of("src", "main", "java", "com", "shop", "platform").resolve(relative);
        assertThat(path).as("找不到 %s（文件挪了就要同步本测试）", relative).exists();
        return Files.readString(path, StandardCharsets.UTF_8).replaceAll("/\\*[\\s\\S]*?\\*/", " ");
    }

    private static int batchLimit(String relative) throws IOException {
        Matcher m = Pattern.compile("BATCH_LIMIT = (\\d+)").matcher(codeOf(relative));
        assertThat(m.find()).as("%s 里没有 BATCH_LIMIT = 数字 这一格", relative).isTrue();
        return Integer.parseInt(m.group(1));
    }
}
