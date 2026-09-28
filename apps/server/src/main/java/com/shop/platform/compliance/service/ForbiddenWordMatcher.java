package com.shop.platform.compliance.service;

import com.shop.platform.compliance.api.ForbiddenCategory;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * 违禁词命中判定（COM-01）—— 纯函数，不碰 DB、不碰 Spring，可直接单测。
 *
 * <p>口径收在这里而不是散在各处：归一（大小写 / 全半角 / 兼容字符）一旦分散，「商品标题过闸、
 * 评价过闸」两道口子就会慢慢长成两套判定，运营改一次词表要改两个地方。
 *
 * <p>本轮只做<b>子串命中</b>，不做正则/通配/分词——那些会把误杀面放大到不可预期
 * （「最佳搭配」撞「最佳」），而误杀一个正常卖家的代价（申诉、客诉）远高于漏放一个灰词。
 * 将来要加规则是加列 + 改这里，不改「词表只管有哪些词」的边界。
 */
public final class ForbiddenWordMatcher {

    /**
     * 归一后的文本：NFKC 折叠全角/半角与兼容字符 + 小写 + 去掉零宽字符。
     *
     * <p>NFKC 顺带把「①②③」折成「123」，所以词表里写「１００％」也能被「100%」这条命中——
     * 卖家用全角绕过是常见的，闸门要认。
     */
    static String normalize(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        return Normalizer.normalize(text, Normalizer.Form.NFKC)
                .replaceAll("[\\u200B-\\u200D\\uFEFF]", "")
                .toLowerCase(Locale.ROOT);
    }

    /**
     * 在归一后的文本里找一个归一后的词。
     *
     * @return 命中的原词（给卖家看的那个词形，不是归一后的），没命中则空
     */
    public static Optional<String> findHit(String text, String word) {
        String needle = normalize(word);
        if (needle.isEmpty()) {
            return Optional.empty();
        }
        return normalize(text).contains(needle) ? Optional.of(word) : Optional.empty();
    }

    /**
     * 在一段文本里找出所有命中的词（按分类稳定排序，同分类按词表顺序）。
     *
     * @param words 归一前的词表（通常是 {@code ForbiddenWord} 的 word 列取值）
     * @return 命中词 + 分类的列表，空文本或空词表恒为空
     */
    public static List<Hit> findAllHits(String text, List<ForbiddenWordEntry> words) {
        if (text == null || text.isBlank() || words.isEmpty()) {
            return List.of();
        }
        String normalized = normalize(text);
        return words.stream()
                .filter(entry -> !normalize(entry.word()).isEmpty())
                .filter(entry -> normalized.contains(normalize(entry.word())))
                .map(entry -> new Hit(entry.word(), entry.category()))
                .toList();
    }

    /** 词表的一行（归一前的词 + 分类）；不绑 DB 实体，好让纯函数单测不必造实体 */
    public record ForbiddenWordEntry(String word, ForbiddenCategory category) {}

    /** 一次命中：命中的原词 + 它的分类 */
    public record Hit(String word, ForbiddenCategory category) {}

    private ForbiddenWordMatcher() {}
}
