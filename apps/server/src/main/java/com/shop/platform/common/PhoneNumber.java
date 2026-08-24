package com.shop.platform.common;

import java.util.regex.Pattern;

/**
 * 手机号值对象：归一化后按值比较，不可变、无身份。
 *
 * <p>把「手机号」从裸 String 里拎出来，把两件事收口进类型：
 * <ul>
 *   <li>归一化：去掉用户输入的杂讯（空格 / 连字符 / 括号），统一成 DB 里一致的形态，避免「138 0000 0000」和「13800000000」被当成两个号；</li>
 *   <li>校验：格式非法时在构造期就报错，而不是等到别处才炸。</li>
 * </ul>
 *
 * <p>与 strict 电话校验的区别：这里只保证「可归一化且基本合法」，不锁定某一国区号规则。
 * 业务要强校验（如必须是大陆手机号）时，在调用处叠加 {@link #isChinaMobile()}。
 */
public record PhoneNumber(String value) {

    /** 归一化后允许：可选的国际前缀 +，其余为数字，长度 5–20。索引 0 除外 */
    private static final Pattern NORMALIZABLE = Pattern.compile("^\\+?\\d{5,20}$");

    /** 大陆手机号正则（编译期常量）：@Pattern 等注解场景直接引用本常量，规则单点化 */
    public static final String CHINA_MOBILE_PATTERN = "^1[3-9]\\d{9}$";

    /** 大陆手机号：1 开头、第二位 3-9、共 11 位 */
    private static final Pattern CHINA_MOBILE = Pattern.compile(CHINA_MOBILE_PATTERN);

    public PhoneNumber {
        Validate.isTrue(value != null && NORMALIZABLE.matcher(value).matches(), "手机号格式不正确");
    }

    /** 工厂：入参归一化（去空格、连字符、括号、点号），空串视为非法 */
    public static PhoneNumber of(String raw) {
        if (raw == null) {
            throw BusinessException.badRequest("手机号格式不正确");
        }
        String normalized = raw.replaceAll("[\\s\\-().]", "");
        return new PhoneNumber(normalized);
    }

    /** 是否大陆手机号（业务需要强地区校验时用） */
    public boolean isChinaMobile() {
        return CHINA_MOBILE.matcher(value).matches();
    }

    /** 脱敏展示：138****8000。日志、异步通知里避免明文落盘 */
    public String masked() {
        return mask(value);
    }

    /** 脱敏任意手机号字符串（不校验格式，null/过短一律 ****）：日志与展示层脱敏的统一出口 */
    public static String mask(String rawPhone) {
        if (rawPhone == null || rawPhone.length() < 7) return "****";
        return rawPhone.substring(0, 3) + "****" + rawPhone.substring(rawPhone.length() - 4);
    }
}
