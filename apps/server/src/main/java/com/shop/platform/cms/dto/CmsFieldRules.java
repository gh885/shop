package com.shop.platform.cms.dto;

/**
 * 首页内容（banner / 分类导航 / 推荐词条）的字段长度口径：三个入参与其载体一处共用，不各抄一遍。
 *
 * <p>与 {@code LinkTarget} 同一个理由：这几格今天逐字节相同（{@code title} 那一档在
 * {@code BannerRequest}、{@code NavRequest}、{@code NavGroup.name}、{@code NavGroup.items} 四处各写一遍
 * {@code @Size(max = 64)}），而漂移是无声的——改了一处放宽，另外三处还按老上限放行，运营看到的是
 * 「同一个框在不同弹窗里能写的字数不一样」。
 *
 * <p><b>按概念分档，不按数字分档</b>：{@code TAB_NAME_MAX} 与 {@link #KEY_MAX} 都是 32，但一个是
 * 给用户看的词条名、一个是运营配置的定位码（{@code slot} / {@code navKey} / {@code iconKey}），
 * 合并成一个常量就等于把两件事绑死——日后要把词条名放宽到 40，会连带改掉码列宽度那一格。
 *
 * <p>每档与落点那一列的 {@code VARCHAR(n)} 同值（{@code cms.banners}/{@code cms.nav_entries}/
 * {@code cms.recommend_tabs}），等值关系由 {@code FieldRuleVocabularyTest} 核对；管理端表单的
 * {@code maxLength} 是第三份，同样由它核对（方向：只许等于或严于契约）。
 */
public final class CmsFieldRules {

    /** 运营位短标题上限（字）：banner 主标题、导航条目标题、导航分组名、分组词条文案同一档 */
    public static final int TITLE_MAX = 64;

    /** banner 副标题上限（字）：主标题下面那一行小字，比主标题宽，卡片上仍是单行截断 */
    public static final int SUBTITLE_MAX = 128;

    /** 推荐词条名上限（字）：首页 tab 条上那几个字，写长了 tab 条就要换行 */
    public static final int TAB_NAME_MAX = 32;

    /** 定位码上限（字）：slot / navKey / iconKey 都是运营手填的机器可读码，不是文案 */
    public static final int KEY_MAX = 32;

    /** 一个导航条目最多挂几个分组：超出就是首页那一屏放不下，而不是「再想想还能塞几个」 */
    public static final int SUB_GROUPS_MAX = 30;

    /**
     * 跳转目标上限（字）：{@code target} 是三态混合——类目/商品 id、搜索词、或活动码，
     * 三张表都是 {@code VARCHAR(255)}。它和 {@link #URL_MAX} 不是一回事：真正的任意 URL 走
     * {@code banners.link} 那一格（{@code target_type=URL} 时才用），所以放宽目标不影响外链那格。
     */
    public static final int TARGET_MAX = 255;

    /** 外链上限（字）：banner 图片地址与 {@code target_type=URL} 时的跳转链接同一档（列宽 512） */
    public static final int URL_MAX = 512;

    private CmsFieldRules() {}
}
