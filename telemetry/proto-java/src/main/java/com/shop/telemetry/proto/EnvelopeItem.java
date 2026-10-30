package com.shop.telemetry.proto;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Envelope 里的一项。header 是完整的一行 JSON（含 {@code type} 与可选 {@code length}），payload 是该项的内容。
 *
 * <p>M0 只处理 JSON 类 item（event / transaction / session / check_in），所以 payload 以字符串表示。
 * 二进制 item（attachment / replay_recording）在 M2 进来时改为 {@code byte[]}——
 * 拆分本身已经是按字节长度走的（见 {@link EnvelopeReader}），换表示不影响解析正确性。
 */
public record EnvelopeItem(String headerJson, String payload) {

    private static final Pattern TYPE = Pattern.compile("\"type\"\\s*:\\s*\"([^\"]+)\"");

    /** item 类型（event / transaction / session / check_in / release）。取不到时返回 {@code unknown}。 */
    public String type() {
        Matcher m = TYPE.matcher(headerJson);
        return m.find() ? m.group(1) : "unknown";
    }
}
