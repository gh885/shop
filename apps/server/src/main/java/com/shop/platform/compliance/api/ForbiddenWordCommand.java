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
     * @param field 出错字段的机器名（与调用方表单/DTO 的字段名同名，如 {@code name}），进 errors[].field 供前端定位输入框
     * @param fieldLabel 出错提示里的字段名（如「标题」「卖点」「评价内容」）
     * @param text 待判定文本，可空/空串（恒视为干净）
     */
    public void assertClean(String field, String fieldLabel, String text) {
        forbiddenWordService.assertClean(field, fieldLabel, text);
    }

    /**
     * 批量判定多段文本：任一段命中即抛（顺序即报错优先级，调用方按「标题 → 卖点 → 详情」的顺序传，
     * 报错就落在卖家最先看到的那一处）。
     */
    public void assertAllClean(CleanText... texts) {
        for (CleanText text : texts) {
            forbiddenWordService.assertClean(text.field(), text.fieldLabel(), text.text());
        }
    }

    /**
     * 一段待判定的公开文本：机器字段名（给前端定位）+ 中文标签（给那句话）+ 内容。
     *
     * <p>两个字段名并存不是冗余：{@code field} 是消费方表单的键（前端按它标红输入框），
     * {@code fieldLabel} 是给人看的叫法。合成一个就必然要么把中文当键传（前端只能按中文正则认字段），
     * 要么让 compliance 知道别人表单里的键名。
     */
    public record CleanText(String field, String fieldLabel, String text) {}
}
