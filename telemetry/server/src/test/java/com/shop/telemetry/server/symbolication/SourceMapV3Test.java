package com.shop.telemetry.server.symbolication;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * 手写 VLQ 的边界测试。这段代码错了不会报错，只会把堆栈指到错的行——
 * 所以宁可把 {@code mappings} 手工算出来钉死，也不去用工具生成。
 *
 * <p>VLQ 速查：{@code A}=0，{@code C}=+1，{@code D}=-1，{@code U}=+10。
 */
class SourceMapV3Test {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void resolvesSingleSegmentPerLine() {
        SourceMapV3 map = parse("""
                {"version":3,"sources":["src/a.ts"],"names":[],"mappings":"AAAA;AACA"}
                """);

        assertEquals(new OriginalPosition("src/a.ts", 1, 1, null), map.lookup(1, 1).orElseThrow());
        assertEquals(new OriginalPosition("src/a.ts", 2, 1, null), map.lookup(2, 1).orElseThrow());
    }

    /** 落在两段之间时归到左侧那段：映射是区间语义，不是精确匹配。 */
    @Test
    void nearestPrecedingSegmentWins() {
        SourceMapV3 map = parse("""
                {"version":3,"sources":["src/a.ts"],"names":[],"mappings":"AAAA,UACA"}
                """);

        assertEquals(1, map.lookup(1, 1).orElseThrow().line());
        assertEquals(1, map.lookup(1, 10).orElseThrow().line());
        // 第 2 段在 genColumn 10：10 之后都归它
        assertEquals(2, map.lookup(1, 11).orElseThrow().line());
        assertEquals(2, map.lookup(1, 500).orElseThrow().line());
    }

    @Test
    void supportsNamesAndSourceColumnDelta() {
        SourceMapV3 map = parse("""
                {"version":3,"sources":["src/a.ts"],"names":["render"],"mappings":"AAACA"}
                """);

        OriginalPosition position = map.lookup(1, 1).orElseThrow();

        assertEquals("src/a.ts", position.source());
        assertEquals(1, position.line());
        assertEquals(2, position.column());
        assertEquals("render", position.name());
    }

    @Test
    void emptyLineHasNoMapping() {
        SourceMapV3 map = parse("""
                {"version":3,"sources":["src/a.ts"],"names":[],"mappings":"AAAA;;AACA"}
                """);

        assertTrue(map.lookup(2, 1).isEmpty());
        assertTrue(map.lookup(3, 1).isPresent());
    }

    @Test
    void outOfRangeLineReturnsEmptyInsteadOfGuessing() {
        SourceMapV3 map = parse("""
                {"version":3,"sources":["src/a.ts"],"names":[],"mappings":"AAAA"}
                """);

        assertTrue(map.lookup(0, 1).isEmpty());
        assertTrue(map.lookup(9, 1).isEmpty());
        assertFalse(map.sources().isEmpty());
    }

    @Test
    void negativeColumnIsClampedToLineStart() {
        SourceMapV3 map = parse("""
                {"version":3,"sources":["src/a.ts"],"names":[],"mappings":"AACA"}
                """);

        Optional<OriginalPosition> position = map.lookup(1, -3);

        assertTrue(position.isPresent());
        assertNull(position.get().name());
    }

    @Test
    void rejectsNonV3AndBrokenVLQ() {
        assertThrows(
                IllegalArgumentException.class, () -> parse("""
                        {"version":2,"sources":[],"names":[],"mappings":""}
                        """));
        assertThrows(
                IllegalArgumentException.class, () -> parse("""
                        {"version":3,"sources":["a"],"names":[],"mappings":"!!!"}
                        """));
        assertThrows(
                IllegalArgumentException.class, () -> parse("""
                        {"version":3,"sources":["a"],"names":[]}
                        """));
    }

    /**
     * 把 demo 夹具和浏览器样本钉在一起：上传 {@code demo/summary.js.map} 之后，浏览器那条事件
     * 的第 1 行第 28371 列必须还原成 summary.tsx:74:12。改了任何一边这条测试都会红。
     */
    @Test
    void demoSourceMapMatchesBrowserFixture() throws Exception {
        SourceMapV3 map = SourceMapV3.parse(JSON.readTree(
                java.nio.file.Files.readString(java.nio.file.Path.of("..", "proto", "fixtures", "demo", "summary.js.map"))));

        OriginalPosition position = map.lookup(1, 28371).orElseThrow();

        assertEquals("src/features/checkout/summary.tsx", position.source());
        assertEquals(74, position.line());
        assertEquals(12, position.column());
    }

    private static SourceMapV3 parse(String json) {
        return SourceMapV3.parse(JSON.readTree(json));
    }
}
