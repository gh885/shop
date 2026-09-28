package com.shop.platform.compliance;

import static com.shop.platform.compliance.api.ForbiddenCategory.AD_LAW;
import static com.shop.platform.compliance.api.ForbiddenCategory.FRAUD;
import static com.shop.platform.compliance.api.ForbiddenCategory.INFRINGEMENT;
import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.compliance.api.ForbiddenCategory;
import com.shop.platform.compliance.service.ForbiddenWordMatcher;
import com.shop.platform.compliance.service.ForbiddenWordMatcher.ForbiddenWordEntry;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 命中判定口径（COM-03）的单测——纯函数，不碰库、不起 Spring。
 *
 * <p>这一格是全闸门的地板：判定口径只有这一份，卖家换个写法（全角、大写、插零宽字符）就绕过闸门，
 * 是「看着有闸其实没有」。所以这里钉的不是「能不能命中」，而是<b>哪些变形仍然命中</b>、
 * 以及<b>报错时交出去的是卖家写的那个词形还是归一后的</b>。
 */
class ForbiddenWordMatcherTest {

    private static final List<ForbiddenWordEntry> WORDS =
            List.of(entry("最佳", AD_LAW), entry("刷单", FRAUD), entry("高仿", INFRINGEMENT));

    private static ForbiddenWordEntry entry(String word, ForbiddenCategory category) {
        return new ForbiddenWordEntry(word, category);
    }

    @Test
    void 半量子串命中_交回词表里的原词形() {
        assertThat(ForbiddenWordMatcher.findHit("宠物智能喂食器 最佳选择", "最佳")).contains("最佳");
    }

    @Test
    void 全角写法_照样命中() {
        // 词表存半角（100%有效），卖家写全角是常见的绕行手法
        assertThat(ForbiddenWordMatcher.findHit("１００％有效 纯羊绒", "100%有效")).contains("100%有效");
    }

    @Test
    void 拉丁字母大小写_不成为绕行面() {
        assertThat(ForbiddenWordMatcher.findHit("BEST 高仿复刻", "best")).contains("best");
        assertThat(ForbiddenWordMatcher.findHit("best seller", "BEST")).contains("BEST");
    }

    @Test
    void 词中间插零宽字符_折叠后仍命中() {
        assertThat(ForbiddenWordMatcher.findHit("最\u200B佳选择", "最佳")).contains("最佳");
    }

    @Test
    void 圈码等兼容字符_按NFKC折叠后命中() {
        assertThat(ForbiddenWordMatcher.findHit("①流品质", "1")).contains("1");
    }

    @Test
    void 空文本与空白文本_恒为干净() {
        assertThat(ForbiddenWordMatcher.findHit("", "最佳")).isEmpty();
        assertThat(ForbiddenWordMatcher.findHit("   ", "最佳")).isEmpty();
        assertThat(ForbiddenWordMatcher.findHit(null, "最佳")).isEmpty();
        assertThat(ForbiddenWordMatcher.findAllHits(null, WORDS)).isEmpty();
    }

    @Test
    void 空词_不命中任何东西() {
        // 词表里混进空串（运营误录）时，闸门不该把每条商品都拦下来
        assertThat(ForbiddenWordMatcher.findHit("任意文本", "")).isEmpty();
        assertThat(ForbiddenWordMatcher.findAllHits("任意文本", List.of(entry("  ", AD_LAW))))
                .isEmpty();
    }

    @Test
    void 词表为空_恒为干净() {
        assertThat(ForbiddenWordMatcher.findAllHits("最佳刷单高仿", List.of())).isEmpty();
    }

    @Test
    void 多段命中_按词表顺序交回_第一个就是报错那一个() {
        // 报错只给第一个命中（COM-04），所以命中顺序是卖家先看到哪一类的唯一决定因素
        assertThat(ForbiddenWordMatcher.findAllHits("最佳、刷单、高仿都想要", WORDS))
                .containsExactly(
                        new ForbiddenWordMatcher.Hit("最佳", AD_LAW),
                        new ForbiddenWordMatcher.Hit("刷单", FRAUD),
                        new ForbiddenWordMatcher.Hit("高仿", INFRINGEMENT));
    }

    @Test
    void 归一口径不污染词表_命中交回的是词表里那一行() {
        List<ForbiddenWordEntry> only = List.of(entry("刷单", FRAUD));

        assertThat(ForbiddenWordMatcher.findAllHits("专业 S H U A 单 代刷", only)).isEmpty();
        assertThat(ForbiddenWordMatcher.findAllHits("代刷单服务", only))
                .extracting(ForbiddenWordMatcher.Hit::word)
                .containsExactly("刷单");
    }
}
