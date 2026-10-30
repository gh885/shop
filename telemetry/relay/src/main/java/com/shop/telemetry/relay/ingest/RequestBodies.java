package com.shop.telemetry.relay.ingest;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;

/**
 * 请求体读取。**刻意不用 {@code @RequestBody}**。
 *
 * <p>两个都是真踩过的坑：
 *
 * <ol>
 *   <li>**gzip**。官方 SDK 默认压缩请求体（`io.sentry` 的 HttpTransport、浏览器端的大 envelope）。
 *       我们最初只用 curl 测，curl 不发 gzip，于是"本地全通、接真 SDK 全 400"。
 *   <li>**message converter 会改写字节**。`@RequestBody byte[]` 的 message converter 是按
 *       Content-Type 挑的：curl 不带 header 时默认 `application/x-www-form-urlencoded`，
 *       Spring 就用 form 解析器把 body 当键值对解一遍，**换行全被吃掉**，于是 relay 报
 *       "缺少 header 行"。envelope 是字节级协议帧（长度字段按字节算），任何解析器都无权碰它。
 * </ol>
 *
 * <p>上限保护也在这里：解压炸弹（1KB 压出 1GB）是最省力的打垮入口的方式。真实配额
 * （按项目、按天）在 M2，但"单请求上限"必须现在就有。
 */
final class RequestBodies {

    /** Sentry 的 envelope 上限是 1MB，附件类另算；我们目前不收附件，给足余量。 */
    private static final int MAX_RAW_BYTES = 16 * 1024 * 1024;

    private static final int MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024;

    private RequestBodies() {}

    static byte[] readBytes(HttpServletRequest request, String contentEncoding) {
        byte[] raw;
        try {
            raw = request.getInputStream().readNBytes(MAX_RAW_BYTES + 1);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (raw.length > MAX_RAW_BYTES) {
            throw new TooLarge();
        }
        if (raw.length == 0 && isForm(request.getContentType())) {
            // 这种情况几乎总是"手写 curl 时漏了 Content-Type"，报清楚比让下一个人再查一小时好
            throw new IllegalArgumentException("请求体为空：Content-Type 是表单类型时会被框架当键值对解析。"
                    + "envelope 必须用 application/x-sentry-envelope");
        }
        return decode(raw, contentEncoding);
    }

    static String readText(HttpServletRequest request, String contentEncoding) {
        return new String(readBytes(request, contentEncoding), StandardCharsets.UTF_8);
    }

    private static boolean isForm(String contentType) {
        return contentType != null && contentType.toLowerCase(java.util.Locale.ROOT).startsWith(
                "application/x-www-form-urlencoded");
    }

    private static byte[] decode(byte[] body, String contentEncoding) {
        if (contentEncoding == null || contentEncoding.isBlank() || "identity".equalsIgnoreCase(contentEncoding)) {
            return body;
        }
        if (!"gzip".equalsIgnoreCase(contentEncoding) && !"x-gzip".equalsIgnoreCase(contentEncoding)) {
            throw new IllegalArgumentException("不支持的 Content-Encoding: " + contentEncoding);
        }
        try (GZIPInputStream in = new GZIPInputStream(new java.io.ByteArrayInputStream(body))) {
            byte[] decoded = in.readNBytes(MAX_DECOMPRESSED_BYTES + 1);
            if (decoded.length > MAX_DECOMPRESSED_BYTES) {
                throw new TooLarge();
            }
            return decoded;
        } catch (IOException e) {
            throw new IllegalArgumentException("gzip 解压失败：" + e.getMessage());
        }
    }

    /** 超过上限。单独一个类型是为了让 controller 回 413 而不是 400——语义不同，SDK 的重试策略也不同。 */
    static final class TooLarge extends IllegalArgumentException {

        TooLarge() {
            super("请求体超过上限");
        }
    }
}
