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
 * <p>手机号校验口径全库统一为三档，每档一个具名出口，DTO 只引用常量、不各写正则：
 * <ul>
 *   <li><b>短信目标号强校验</b>——必须是大陆手机号，卡 {@link #CHINA_MOBILE_PATTERN}，
 *       凡触发真实发短信的入站端点都用它（/auth/sms-code、/auth/forgot-password、店员邀请接收号、店主邀人）；</li>
 *   <li><b>联系电话弱校验</b>——收货人 / 寄件人电话，卡 {@link #CONTACT_PATTERN}：这类号只落库不外呼，
 *       不必是大陆手机号（海外号、店主座机都要存得下），但也只放 {@code + 数字 -}，
 *       <b>空格与括号不在门内</b>——粘贴「138 0000 0000」今天会被挡成 400。放宽它 = 改契约那一格的 pattern，
 *       要起后端跑 {@code pnpm gen:sdk}（{@code ApiDocsContractTest} 会先把不一致判红），属接口变更而非内部优化；</li>
 *   <li><b>登录标识只挡长度</b>——登录族 DTO（PasswordLoginRequest 等）用 {@code @Size(7,20)}，不锁国区号
 *       （历史数据 / 海外号可登录；这类号收不到短信，但短信路径必先从强校验的发码入口进入）。</li>
 * </ul>
 * 本值对象本身只保证「可归一化且基本合法」，不承担档位判定；但三档都是它的子集——
 * 过了任何一档 DTO 的号，{@code of()} 必归一化得掉，不会一处放行一处 400（这条由 {@code ValidationVocabularyTest} 钉住）。
 */
public record PhoneNumber(String value) {

    /** 归一化后允许：可选的国际前缀 +，其余为数字，长度 5–20。索引 0 除外 */
    private static final Pattern NORMALIZABLE = Pattern.compile("^\\+?\\d{5,20}$");

    /** 大陆手机号正则（编译期常量）：@Pattern 等注解场景直接引用本常量，规则单点化 */
    public static final String CHINA_MOBILE_PATTERN = "^1[3-9]\\d{9}$";

    /**
     * 联系电话（未归一化的原始输入）允许 {@code + 数字 -}：收货地址、店铺寄件地址两处共用这一个常量，
     * 值与 {@code openapi/api-docs.json} 里那两格 pattern 逐字节相同（改它即改契约，见类注释）。
     *
     * <p>它是粗形而不是终判：过了这一关还要过 {@link #of(String)} 的归一化闸门，两处失败同为
     * 「手机号格式不正确」400，调用方看不出差别。
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
        String normalized = raw.replaceAll("[\\s\\-().]", "");
        return new PhoneNumber(normalized);
    }

    /** 脱敏任意手机号字符串（不校验格式，null/过短一律 ****）：日志与展示层脱敏的统一出口 */
    public static String mask(String rawPhone) {
        if (rawPhone == null || rawPhone.length() < 7) return "****";
        return rawPhone.substring(0, 3) + "****" + rawPhone.substring(rawPhone.length() - 4);
    }
}
