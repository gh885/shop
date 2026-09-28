package com.shop.platform.compliance.api;

import com.shop.platform.compliance.service.ForbiddenWordService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 违禁词闸门命令（跨模块消费，COM-01）：product / review / aftersale 在自己的写入事务里同步调用。
 *
 * <p><b>同步而非事件</b>：内容闸门必须在写入的同一事务里裁决。「先写后异步扫」意味着违规文本已经公开过
 * （哪怕秒删），那是事后补救不是闸门；宁可让文本带违禁词把这次写入一起回滚。
 *
 * <p>不强制事务传播：调用方可能是发布（提交/发布），也可能是普通编辑；判定本身是只读的
 * （service 侧 SUPPORTS + 缓存），能不能同事务回滚取决于调用方是否在事务里。
 * 真正需要「不过闸就回滚」的调用点（发布）都在事务里。
 */
@Component
@RequiredArgsConstructor
public class ForbiddenWordCommand {

    private final ForbiddenWordService forbiddenWordService;

    /**
     * 判定一段公开文本；带违禁词则抛 400 {@code FORBIDDEN_WORD_HIT}。
     *
     * @param fieldLabel 出错提示里的字段名（如「标题」「卖点」「评价内容」）
     * @param text 待判定文本，可空/空串（恒视为干净）
     */
    public void assertClean(String fieldLabel, String text) {
        forbiddenWordService.assertClean(fieldLabel, text);
    }

    /**
     * 批量判定多段文本：任一段命中即抛（顺序即报错优先级，调用方按「标题 → 卖点 → 详情」的顺序传，
     * 报错就落在卖家最先看到的那一处）。
     */
    public void assertAllClean(CleanText... texts) {
        for (CleanText text : texts) {
            forbiddenWordService.assertClean(text.fieldLabel(), text.text());
        }
    }

    /** 一段待判定的公开文本：字段名（提示用）+ 内容 */
    public record CleanText(String fieldLabel, String text) {}
}
