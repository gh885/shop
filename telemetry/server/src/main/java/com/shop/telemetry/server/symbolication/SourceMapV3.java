package com.shop.telemetry.server.symbolication;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import tools.jackson.databind.JsonNode;

/**
 * Source Map v3 的最小可用实现：只做"给定压缩后位置，还原原始文件与行列"。
 *
 * <p>为什么自己写而不是引库：Java 侧没有 {@code @jridgewell/trace-mapping} 那种事实标准
 * （Sentry 的 symbolicator 是 Rust），而这段 VLQ 解码 + 每行二分查找是**纯函数**，
 * 能单测到边界，比引一个来源不明的依赖更容易审。
 *
 * <p>刻意不做的（写清楚免得误用）：
 *
 * <ul>
 *   <li>不解析 {@code sourcesContent}——M0 只显示"原始文件:行:列"，不内联源码
 *   <li>不处理 {@code sections}（index map，webpack 老式分包）
 *   <li>不翻译 {@code webpack://} 之类前缀，原样返回，由展示层决定怎么截
 * </ul>
 *
 * <p>坐标约定：对外**一律 1-based**（对齐 Sentry frame 的 {@code lineno}/{@code colno}），
 * 内部按 v3 规范用 0-based。转换只发生在 {@link #lookup(int, int)} 里，不散落。
 */
public final class SourceMapV3 {

    private static final String BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    private final List<String> sources;
    private final List<String> names;
    /** 每行按 genColumn 升序的段：{genColumn, sourceIndex, sourceLine, sourceColumn, nameIndex}，-1 表示缺省 */
    private final List<List<int[]>> lines;

    private SourceMapV3(List<String> sources, List<String> names, List<List<int[]>> lines) {
        this.sources = sources;
        this.names = names;
        this.lines = lines;
    }

    public static SourceMapV3 parse(JsonNode map) {
        if (map == null || !map.isObject()) {
            throw new IllegalArgumentException("source map 不是 JSON 对象");
        }
        JsonNode version = map.path("version");
        if (!version.isNumber() || version.asInt() != 3) {
            throw new IllegalArgumentException("只支持 source map v3，拿到的是 " + version);
        }
        JsonNode mappings = map.path("mappings");
        if (!mappings.isString()) {
            throw new IllegalArgumentException("source map 缺少 mappings");
        }
        return new SourceMapV3(
                strings(map.path("sources")), strings(map.path("names")), decodeMappings(mappings.asString()));
    }

    /**
     * @param lineNumber 1-based 生成代码行号（Sentry frame 的 {@code lineno}）
     * @param column 1-based 生成代码列号（Sentry frame 的 {@code colno}）
     */
    public Optional<OriginalPosition> lookup(int lineNumber, int column) {
        int lineIndex = lineNumber - 1;
        if (lineIndex < 0 || lineIndex >= lines.size()) {
            return Optional.empty();
        }
        List<int[]> segments = lines.get(lineIndex);
        if (segments.isEmpty()) {
            return Optional.empty();
        }
        int targetColumn = Math.max(column - 1, 0);
        // 二分找最后一个 genColumn <= target：映射是区间语义，落在空隙里要归到左侧那段
        int low = 0;
        int high = segments.size() - 1;
        int found = -1;
        while (low <= high) {
            int mid = (low + high) >>> 1;
            if (segments.get(mid)[0] <= targetColumn) {
                found = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        if (found < 0) {
            return Optional.empty();
        }
        int[] segment = segments.get(found);
        if (segment[1] < 0 || segment[1] >= sources.size()) {
            return Optional.empty();
        }
        String name = segment[4] >= 0 && segment[4] < names.size() ? names.get(segment[4]) : null;
        return Optional.of(
                new OriginalPosition(sources.get(segment[1]), segment[2] + 1, segment[3] + 1, name));
    }

    public List<String> sources() {
        return List.copyOf(sources);
    }

    private static List<String> strings(JsonNode array) {
        List<String> result = new ArrayList<>();
        if (array.isArray()) {
            for (JsonNode item : array) {
                result.add(item.isString() ? item.asString() : "");
            }
        }
        return result;
    }

    /**
     * 段内每个字段是**相对前一个段的增量**，而 genColumn 每行重置、其余三个跨行沿用——
     * 这条规则是 v3 最容易写错的地方，写错了不报错，只是位置全歪。
     */
    private static List<List<int[]>> decodeMappings(String mappings) {
        List<List<int[]>> lines = new ArrayList<>();
        List<int[]> current = new ArrayList<>();
        int generatedColumn = 0;
        int sourceIndex = 0;
        int sourceLine = 0;
        int sourceColumn = 0;
        int nameIndex = 0;

        int pos = 0;
        while (pos < mappings.length()) {
            char c = mappings.charAt(pos);
            if (c == ';') {
                lines.add(current);
                current = new ArrayList<>();
                generatedColumn = 0;
                pos++;
                continue;
            }
            if (c == ',') {
                pos++;
                continue;
            }
            int[] fields = new int[5];
            int count = 0;
            while (pos < mappings.length()) {
                char next = mappings.charAt(pos);
                if (next == ',' || next == ';') {
                    break;
                }
                int[] decoded = decodeValue(mappings, pos);
                pos = decoded[1];
                if (count < fields.length) {
                    fields[count] = decoded[0];
                }
                count++;
            }

            generatedColumn += fields[0];
            int[] segment = {generatedColumn, -1, -1, -1, -1};
            if (count >= 4) {
                sourceIndex += fields[1];
                sourceLine += fields[2];
                sourceColumn += fields[3];
                segment[1] = sourceIndex;
                segment[2] = sourceLine;
                segment[3] = sourceColumn;
            }
            if (count >= 5) {
                nameIndex += fields[4];
                segment[4] = nameIndex;
            }
            current.add(segment);
        }
        lines.add(current);
        return lines;
    }

    /** @return {value, nextPosition} */
    private static int[] decodeValue(String mappings, int start) {
        int value = 0;
        int shift = 0;
        int pos = start;
        boolean continuation;
        do {
            if (pos >= mappings.length()) {
                throw new IllegalArgumentException("mappings 在 VLQ 中途结束，offset=" + start);
            }
            int digit = BASE64.indexOf(mappings.charAt(pos));
            if (digit < 0) {
                throw new IllegalArgumentException("非法 base64 字符 '" + mappings.charAt(pos) + "'，offset=" + pos);
            }
            continuation = (digit & 32) != 0;
            value += (digit & 31) << shift;
            shift += 5;
            pos++;
        } while (continuation);
        boolean negative = (value & 1) != 0;
        int magnitude = value >>> 1;
        return new int[] {negative ? -magnitude : magnitude, pos};
    }
}
