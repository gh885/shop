package com.shop.platform.common;

/**
 * 昵称值对象：只负责「公共出口该给人看什么形状」。
 *
 * <p>存在的理由是 REV-15 —— 评价是公共出口，买家昵称在那里恒为掩码。掩码规则一旦散成几处
 * {@code substring} 拼接，宽度就会漂（有的 3 后 3、有的 2 后 2），而「买家昵称长什么样」是对外承诺的一部分。
 *
 * <p>形状：前 2 后 2，中间 {@code ***}；不足 5 个字符一律整串 {@code ***}（短昵称再截就没有信息量，
 * 还会让「1 位昵称」和「2 位昵称」看起来一样）。
 */
public final class Nickname {

    /** 掩码中段：固定三个星，长度与内容都不随原串变化 */
    private static final String MASK = "***";

    /** 短于此长度不再截，直接整串打码 */
    private static final int MIN_MASKABLE_LENGTH = 5;

    /** 头尾各留几个字 */
    private static final int EDGE = 2;

    /**
     * 昵称掩码。null / 空白给 "***"（不是一个可读的名字：空昵称在库里是常态，
     * 展示成空行会让评价列表出现「匿名的空白行」）。
     */
    public static String mask(String nickname) {
        if (nickname == null || nickname.isBlank()) {
            return MASK;
        }
        if (nickname.length() < MIN_MASKABLE_LENGTH) {
            return MASK;
        }
        return nickname.substring(0, EDGE) + MASK + nickname.substring(nickname.length() - EDGE);
    }

    private Nickname() {}
}
