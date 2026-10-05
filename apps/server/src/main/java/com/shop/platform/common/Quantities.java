package com.shop.platform.common;

/**
 * 数量闸门的公共出处：一行买几件、一单写几行、一单用几张券，以及一次批量查询最多几个 ID。
 *
 * <p><b>为什么住 common 而不是各自模块</b>：同一个数由 cart 与 order 两侧共同守——下单行数上限就是购物车条目上限
 * （购物车全选必须能一次下完，否则界面上能勾 100 条、提交必 400），单行件数上限就是 {@code cart.items} 的
 * CHECK 上界。而 order 不得 import cart 的 entity（模块隔离），两模块唯一的合法共享处只有这里。
 *
 * <p><b>这些数字是契约的一部分</b>：注解引用它们，springdoc 把值导出进 {@code openapi/api-docs.json}，
 * 改数字等于接口变更（要跑 {@code pnpm sdk:gen}，{@code ApiDocsContractTest} 会先红）。本类只把「同一个数的多个定义处」
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

    /**
     * 一次批量查询最多几个 ID（售后批量状态、收藏状态等「把刚取到的那一页拿回来问」的入口）。
     *
     * <p>取 {@link PageParams#SIZE_MAX} 的<b>引用</b>而不是再抄一个 100：这些入口的输入就是上一次分页的输出，
     * 比一页更宽的请求不是「用户多选了几个」，是拿列表接口当导出用。两处独立写 100，改一页上限时另一处会静默失联。
     */
    public static final int BATCH_IDS_MAX = PageParams.SIZE_MAX;

    /**
     * 结算行数区间的报错文案：数字由 {@link #ORDER_LINES_MAX} 拼出，预览与创建两个入口共用这一句。
     *
     * <p>此前两条 message 各写一遍 {@code "结算条目需 1 到 99 行"}，上限改了文案还留着旧数——
     * 用户按提示删到 99 行仍然 400（或反过来：提示写着 99，实际放行 200 行）。
     * 文案与数字同值这件事现在由构造保证，而不是由「改的时候记得改两处」保证。
     */
    public static final String ORDER_LINES_MESSAGE = "结算条目需 1 到 " + ORDER_LINES_MAX + " 行";

    /** 用券张数上限的报错文案，同上：数字从 {@link #COUPONS_PER_CHECKOUT_MAX} 来 */
    public static final String COUPONS_PER_CHECKOUT_MESSAGE = "一次结算最多选择 " + COUPONS_PER_CHECKOUT_MAX + " 张优惠券";

    private Quantities() {}
}
