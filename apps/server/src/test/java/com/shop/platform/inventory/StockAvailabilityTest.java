package com.shop.platform.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.inventory.api.StockView;
import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * 「库存这一行没查到算什么」只有一个出口（{@link StockView#availableOrZero} / {@link StockView#stockOrZero}）的快环门禁。
 *
 * <p>这道判断此前散在六处、写法有三种：四个读路径各写 {@code view == null ? 0 : ...} 三元式，
 * 两处上架/改库存校验则现造 {@code new StockView(id, 0, 0, 0)} 喂给 {@code getOrDefault}。
 * 三种写法今天恰好都给 0，但它们是可以各自漂的：只要有人把「缺行」在某处改成「按有货处理」或「跳过不判」，
 * 同一个 SKU 就会在列表页显示有货、在结算页显示缺货，而这条不一致不会让任何测试变红。
 *
 * <p>所以这里既测语义（缺行 = 0、有行 = 如实），也用源码扫描钉住「不许再出现第二种写法」。
 * 扫描是文本级的，不连库、不起 Spring，因此它也是没有本地数据源时唯一还能跑的库存口径核对。
 */
class StockAvailabilityTest {

    private static final Path MAIN = Path.of("src", "main", "java", "com", "shop", "platform");

    /** 投影的行由读侧一处构造，其余地方出现 {@code new StockView(} 就是在凭空补一行 */
    private static final Pattern FABRICATED_ROW = Pattern.compile("new StockView\\(");

    /** 就地三元式：出口之外再写一次「null 就当 0」。刻意不看左边的表达式形状——`x == null` 和 `m.get(k) == null` 是同一种漂移 */
    private static final Pattern INLINE_COALESCING = Pattern.compile("==\\s*null\\s*\\?\\s*0\\s*:");

    private static final List<String> OWNERS = List.of(
            Path.of("inventory", "api", "StockView.java").toString(),
            Path.of("inventory", "api", "StockReadQuery.java").toString());

    @Test
    void 缺行按零算_有行如实() {
        UUID skuId = UUID.randomUUID();
        assertThat(StockView.availableOrZero(null)).as("Map 里没有这个 SKU 的库存行").isZero();
        assertThat(StockView.stockOrZero(null)).as("总量与可用量同一个答法").isZero();
        StockView frozen = new StockView(skuId, 10, 7);
        assertThat(StockView.stockOrZero(frozen)).as("总库存是列上的数").isEqualTo(10);
        assertThat(StockView.availableOrZero(frozen)).as("可用量是查询算好的差值，出口不再减一次").isEqualTo(7);
    }

    @Test
    void 出口有真实调用点而不是自说自话() throws IOException {
        long calls = sources().stream().filter(code -> code.contains("OrZero(")).count();
        assertThat(calls)
                .as("没有任何读路径走出口（出口成了孤儿方法就该删，见 AGENTS.md「不给实体加无调用者的方法」）")
                .isGreaterThanOrEqualTo(5);
    }

    @Test
    void 缺行判断不许有第二种写法() throws IOException {
        for (String file : sourceFiles()) {
            String code = read(file);
            // 概念键控：只管碰过库存投影的文件，别处出现「null 当 0」是另一个概念的判断（同 GEN-58）
            if (!code.contains("StockView")) {
                continue;
            }
            boolean owner = OWNERS.stream().anyMatch(file::endsWith);
            if (INLINE_COALESCING.matcher(code).find()) {
                assertThat(owner)
                        .as("%s 里又出现了就地三元式：「缺行算什么」必须在 StockView 回答一次", file)
                        .isTrue();
            }
            if (FABRICATED_ROW.matcher(code).find()) {
                assertThat(file)
                        .as("%s 里凭空构造了库存行：缺行请走 StockView.stockOrZero / availableOrZero", file)
                        .endsWith("StockReadQuery.java");
            }
        }
    }

    private static List<String> sourceFiles() throws IOException {
        return SourceScanner.javaFiles(MAIN).stream()
                .map(MAIN::relativize)
                .map(Path::toString)
                .toList();
    }

    private static List<String> sources() throws IOException {
        return sourceFiles().stream().map(StockAvailabilityTest::read).toList();
    }

    private static String read(String relative) {
        try {
            return SourceScanner.withoutComments(SourceScanner.read(MAIN.resolve(relative)));
        } catch (IOException e) {
            throw new UncheckedIOException("读取源码失败：" + relative, e);
        }
    }
}
