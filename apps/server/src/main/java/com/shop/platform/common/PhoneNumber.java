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
 * <p>手机号校验口径全库统一为两档：<b>短信目标号强校验</b>——必须是大陆手机号，在 DTO 上叠
 * {@code @Pattern(regexp = PhoneNumber.CHINA_MOBILE_PATTERN)}，凡触发真实发短信的入站端点都卡
 * （/auth/sms-code、/auth/forgot-password、店员邀请接收号）；
 * <b>登录标识弱校验</b>——登录族 DTO（PasswordLoginRequest 等）只挡长度 {@code @Size(7,20)}，
 * 不锁国区号（历史数据/海外号可登录；这类号收不到短信，但短信路径必先从强校验的发码入口进入，
 * 所以走不通短信不影响密码路径）。
 * 本值对象本身只保证「可归一化且基本合法」，不承担档位判定。
 */
public record PhoneNumber(String value) {

    /** 归一化后允许：可选的国际前缀 +，其余为数字，长度 5–20。索引 0 除外 */
    private static final Pattern NORMALIZABLE = Pattern.compile("^\\+?\\d{5,20}$");

    /** 大陆手机号正则（编译期常量）：@Pattern 等注解场景直接引用本常量，规则单点化 */
    public static final String CHINA_MOBILE_PATTERN = "^1[3-9]\\d{9}$";

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
