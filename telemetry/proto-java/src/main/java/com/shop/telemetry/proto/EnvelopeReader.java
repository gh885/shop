package com.shop.telemetry.proto;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 按 Sentry envelope 规范拆分原始请求体。
 *
 * <p>格式是「JSON 行 + 显式字节长度」：
 *
 * <pre>
 * {"event_id":"...","dsn":"..."}
 * {"type":"event","length":412}
 * {412 字节的 event JSON}
 * {"type":"session","length":88}
 * ...
 * </pre>
 *
 * <p>长度必须是**字节**而不是字符——payload 里可以有换行，所以"按行切"是错的；
 * 这里全程按 byte 走，只有最后取 payload 时才按 UTF-8 解码。
 *
 * <p>刻意零依赖、零 JSON 库：relay 是公网入口，它只需要能"安全地切开"，
 * 真正的字段校验在 worker 侧按 {@code proto/schema} 做。切不开就整包拒，不进队列。
 */
public final class EnvelopeReader {

    private static final byte LF = '\n';
    private static final byte CR = '\r';
    /** item header 里的 {@code "length":N}。只认这一个字段，其余留给 schema 校验。 */
    private static final Pattern LENGTH = Pattern.compile("\"length\"\\s*:\\s*(\\d+)");

    private EnvelopeReader() {}

    /**
     * @throws IllegalArgumentException 结构不合法（缺 header、item 缺 length、长度越界、空 envelope）
     */
    public static Envelope read(byte[] raw) {
        if (raw == null || raw.length == 0) {
            throw new IllegalArgumentException("envelope 为空");
        }
        int firstLineEnd = indexOf(raw, LF, 0);
        if (firstLineEnd < 0) {
            throw new IllegalArgumentException("envelope 缺少 header 行");
        }
        String header = stripCr(new String(raw, 0, firstLineEnd, StandardCharsets.UTF_8));
        List<EnvelopeItem> items = new ArrayList<>();
        int pos = firstLineEnd + 1;
        while (pos < raw.length) {
            int lineEnd = indexOf(raw, LF, pos);
            if (lineEnd < 0) {
                lineEnd = raw.length;
            }
            String itemHeader = stripCr(new String(raw, pos, lineEnd - pos, StandardCharsets.UTF_8));
            pos = lineEnd + 1;
            if (itemHeader.isBlank()) {
                break;
            }
            long length = parseLength(itemHeader);
            if (pos + length > raw.length) {
                throw new IllegalArgumentException(
                        "item 长度越界：声明 " + length + " 字节，实际只剩 " + (raw.length - pos));
            }
            String payload = new String(raw, pos, (int) length, StandardCharsets.UTF_8);
            items.add(new EnvelopeItem(itemHeader, payload));
            pos += (int) length;
            // payload 之后允许有且仅有一个分隔换行
            if (pos < raw.length && raw[pos] == LF) {
                pos++;
            } else if (pos + 1 < raw.length && raw[pos] == CR && raw[pos + 1] == LF) {
                pos += 2;
            }
        }
        if (items.isEmpty()) {
            throw new IllegalArgumentException("envelope 至少需要一个 item");
        }
        return new Envelope(header, List.copyOf(items));
    }

    private static long parseLength(String itemHeader) {
        Matcher m = LENGTH.matcher(itemHeader);
        if (!m.find()) {
            throw new IllegalArgumentException("item header 缺少 length 字段：" + itemHeader);
        }
        long value = Long.parseLong(m.group(1));
        if (value < 0 || value > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("item length 非法：" + value);
        }
        return value;
    }

    private static int indexOf(byte[] raw, byte target, int from) {
        for (int i = from; i < raw.length; i++) {
            if (raw[i] == target) {
                return i;
            }
        }
        return -1;
    }

    private static String stripCr(String line) {
        return !line.isEmpty() && line.charAt(line.length() - 1) == (char) CR
                ? line.substring(0, line.length() - 1)
                : line;
    }
}
