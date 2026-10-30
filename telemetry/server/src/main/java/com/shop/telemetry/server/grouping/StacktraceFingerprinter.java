package com.shop.telemetry.server.grouping;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * 降级链：显式 fingerprint → 栈 → 异常类型 + 事务名 → 事务名。
 *
 * <p>和 Sentry 的结构一致（它也按 stack → type → default 逐级降级）。每多一层降级，
 * 就多一类"没有栈但也不该被丢进同一个 group"的事件被正确分开。
 *
 * <p>M0 的归一化只做到"帧串已由调用方归一化"。in_app 过滤、行号剥离、绝对路径压缩
 * 还在 {@code ingest} 侧，等有真实数据后再决定哪些进算法——过早把启发式写进指纹，
 * 改一次就要重算所有历史分组。
 */
@Component
public class StacktraceFingerprinter implements Fingerprinter {

    @Override
    public String fingerprint(FingerprintInput input) {
        if (isPresent(input.explicitFingerprint())) {
            return "explicit:" + input.explicitFingerprint().trim();
        }
        List<String> frames = input.frames() == null ? List.of() : input.frames();
        if (!frames.isEmpty()) {
            return sha256("stack|" + nullToEmpty(input.exceptionType()) + "|" + String.join("|", frames));
        }
        if (isPresent(input.exceptionType())) {
            return sha256("type|" + input.exceptionType() + "|" + nullToEmpty(input.transaction()));
        }
        return sha256("fallback|" + nullToEmpty(input.transaction()));
    }

    private static boolean isPresent(String s) {
        return s != null && !s.isBlank();
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 必须存在于 JRE", e);
        }
    }
}
