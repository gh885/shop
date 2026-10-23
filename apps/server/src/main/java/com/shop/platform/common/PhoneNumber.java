package com.shop.platform.common;

import java.util.regex.Pattern;

/**
 * 联系电话值对象：归一化后按值比较，不可变、无身份。
 *
 * <p>把「联系电话」从裸 String 里拎出来，收口两件事：
 *
 * <ul>
 *   <li>归一化：去掉用户输入的杂讯（空格 / 连字符 / 括号 / 点号），统一成 DB 里一致的形态，
 *       避免「138 0000 0000」和「13800000000」被当成两个号；</li>
 *   <li>校验：格式非法在构造期就报错，而不是等到别处才炸。</li>
 * </ul>
 *
 * <p>收货/寄件电话只落库不外呼，不必是大陆手机号（海外号、座机都要存得下），但也只放
 * {@code + 数字 -}。归一化后再过 {@link #NORMALIZABLE} 的形，两道门失败同为 400。
 */
public record PhoneNumber(String value) {

    /** 归一化后允许：可选的国际前缀 +，其余为数字，长度 5–20 */
    private static final Pattern NORMALIZABLE = Pattern.compile("^\\+?\\d{5,20}$");

    /**
     * 联系电话（未归一化的原始输入）允许 {@code + 数字 -}：收货地址等入参 DTO 的 {@code @Pattern}
     * 直接引用本常量，规则单点化——同一正则出现在两个文件里，改一处忘一处就是口径漂移。
     */
    public static final String CONTACT_PATTERN = "^[0-9+\\-]{5,20}$";

    public PhoneNumber {
        Validate.isTrue(value != null && NORMALIZABLE.matcher(value).matches(), "手机号格式不正确");
    }

    /** 工厂：入参归一化（去空格、连字符、括号、点号），空串视为非法 */
    public static PhoneNumber of(String raw) {
        if (raw == null) {
            throw BusinessException.badRequest("手机号格式不正确");
        }
        return new PhoneNumber(raw.replaceAll("[\\s\\-().]", ""));
    }

    /**
     * 日志与事件用的掩码：留前 3 后 4。手机号是半标识符，明文整串不进日志；
     * 前端展示层的脱敏是另一条通道（各 View 出参自己决定），这里只管服务端日志。
     */
    public static String mask(String phone) {
        if (phone == null || phone.length() < 8) {
            return "******";
        }
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }
}
