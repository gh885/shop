package com.shop.platform.common;

/**
 * 交易数量的三条线：一行买几件、一单写几行、一单用几张券。
 *
 * <p><b>为什么住 common 而不是各自模块</b>：同一个数由 cart 与 order 两侧共同守——下单行数上限就是购物车条目上限
 * （购物车全选必须能一次下完，否则界面上能勾 100 条、提交必 400），单行件数上限就是 {@code cart.items} 的
 * CHECK 上界。而 order 不得 import cart 的 entity（模块隔离），两模块唯一的合法共享处只有这里。
 *
 * <p><b>这些数字是契约的一部分</b>：注解引用它们，springdoc 把值导出进 {@code openapi/api-docs.json}，
 * 改数字等于接口变更（要跑 {@code pnpm gen:sdk}，{@code ApiDocsContractTest} 会先红）。本类只把「同一个数的多个定义处」
 * 收成一处，<b>值一个都没动</b>。等值关系由 {@code FieldRuleVocabularyTest} 核对，包括与 DB CHECK 的那一侧。
 */
public final class Quantities {

    /**
     * 一行的件数上限：加购累加、改数量、结算行三处同一档，与 {@code cart.items}/{@code orders.items} 的
     * CHECK 上界同值（{@code LEAST} 在 DB 侧封顶，这里是入口侧的 400）。
     */
    public static final int LINE_QUANTITY_MAX = 999;

    /** 购物车最多放多少<b>种</b>（不同 SKU）商品：防刷用，同 SKU 累加数量不占新坑 */
    public static final int CART_ITEMS_MAX = 99;

    /** 一次结算最多写几行：与 {@link #CART_ITEMS_MAX} 同值是刻意的（全选要能一次下完），两者相等由门禁钉住 */
    public static final int ORDER_LINES_MAX = 99;

    /** 一次结算最多用几张券：按店拆单，一店一张，所以这是「一单最多涉及几家店」的实际上限 */
    public static final int COUPONS_PER_CHECKOUT_MAX = 20;

    private Quantities() {}
}
