package com.shop.platform.logistics.infra.kdniao;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * 快递鸟报文签名/验签：{@code DataSign = Base64(MD5(requestData + appKey))}。
 *
 * <p>为什么是 MD5 而不是 HMAC：这是对方协议规定的，不是我们的选择——对接外部系统时签名算法不可协商，
 * 我们能做的是把校验收在一处（{@link #verify}）并保证比较不是短路比较。MD5 的碰撞问题在"防篡改 + 带密钥"
 * 场景下不构成实际风险（攻击者要伪造出同 MD5 的不同报文且带正确密钥摘要），但不能脱离密钥裸用。
 *
 * <p>webhook 与主动查询共用同一套签名：主动查询是我们签名、对方验；推送是对方签名、我们验。
 */
public final class KdniaoSign {

    private KdniaoSign() {}

    /** 生成报文签名（主动查询时用） */
    public static String sign(String requestData, String appKey) {
        return digest(requestData + appKey);
    }

    /**
     * 校验推送签名。
     *
     * <p>用 {@link MessageDigest#isEqual} 做常量时间比较：签名比对是典型的可被时序探测的场合
     * （逐字节短路比较会泄露"对了多少位"），这里不给攻击者计时信号。
     */
    public static boolean verify(String requestData, String dataSign, String appKey) {
        if (requestData == null || dataSign == null || appKey == null || appKey.isBlank()) {
            return false;
        }
        byte[] expected = sign(requestData, appKey).getBytes(StandardCharsets.UTF_8);
        byte[] actual = dataSign.trim().getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, actual);
    }

    private static String digest(String payload) {
        try {
            MessageDigest md5 = MessageDigest.getInstance("MD5");
            return Base64.getEncoder().encodeToString(md5.digest(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("运行环境缺少 MD5 摘要算法", e);
        }
    }
}
