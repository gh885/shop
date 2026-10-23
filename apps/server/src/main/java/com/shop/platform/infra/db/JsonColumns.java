package com.shop.platform.infra.db;

import java.util.List;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * jsonb 列读写的唯一定义处。
 *
 * <p>整个后端共用一个 {@link ObjectMapper}（线程安全）：此前每个 Store/Service 各自
 * {@code JsonMapper.builder().build()}，配置漂移（某个文件单独开了特性）只会在运行期显形。
 * 这里用默认配置——列里存什么形状由各模块的 record 决定，映射器不做魔法。
 *
 * <p>解析失败抛 unchecked 的 {@code JacksonException}：调用方若想吞掉坏行（如费率模板的
 * {@code regions}），自己在调用点 catch——哪里宽容哪里声明，不在这里悄悄兜底。
 */
public final class JsonColumns {

    private static final ObjectMapper MAPPER = JsonMapper.builder().build();

    private JsonColumns() {}

    /** 对象 → JSON 字符串。传 {@code null} 得字符串 {@code "null"}（与 writeValueAsString 一致）。 */
    public static String write(Object value) {
        return MAPPER.writeValueAsString(value);
    }

    /** JSON 字符串 → 按类型参数给的形状。列值是 {@code null} 或非法 JSON 时抛异常。 */
    public static <T> T read(String raw, TypeReference<T> type) {
        return MAPPER.readValue(raw, type);
    }

    /** 字符串数组列 → {@code List<String>}；SQL 里已 {@code COALESCE '[]'}，这里只兜 {@code null}。 */
    public static List<String> readStringList(String raw) {
        List<String> parsed = MAPPER.readValue(raw, new TypeReference<List<String>>() {});
        return parsed == null ? List.of() : List.copyOf(parsed);
    }
}
