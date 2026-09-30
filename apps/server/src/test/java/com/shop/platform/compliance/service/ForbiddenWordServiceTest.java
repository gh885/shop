package com.shop.platform.compliance.service;

import static com.shop.platform.compliance.api.ForbiddenCategory.AD_LAW;
import static com.shop.platform.compliance.api.ForbiddenCategory.FRAUD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.compliance.api.ForbiddenCategory;
import com.shop.platform.compliance.mapper.ForbiddenWord;
import com.shop.platform.compliance.mapper.ForbiddenWordMapper;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 违禁词闸门的编排单测（Mockito，不碰库）：COM-01 的那一句 400，以及 COM-05 的词表缓存。
 *
 * <p>下钻到 service 包是为了那条时钟接缝——「运营改词表一分钟内生效」住在 TTL 的过期判断里，
 * 不换掉时钟就只能真等 60 秒，或者干脆不测（不测就等于那条口径没人守）。
 * 命中口径本身（全半角 / 大小写 / 零宽）归 {@code ForbiddenWordMatcherTest}，这里不重复。
 */
@ExtendWith(MockitoExtension.class)
class ForbiddenWordServiceTest {

    @Mock
    private ForbiddenWordMapper forbiddenWordMapper;

    private final AtomicLong now = new AtomicLong(0L);

    private ForbiddenWordService service;

    @BeforeEach
    void setUp() {
        service = new ForbiddenWordService(forbiddenWordMapper);
        service.now = now::get;
    }

    private static ForbiddenWord row(String text, ForbiddenCategory category) {
        return ForbiddenWord.builder()
                .word(text)
                .category(category.name())
                .enabled(true)
                .build();
    }

    @Test
    void 标题命中_400带码_文案是卖家照做得了的那一句() {
        when(forbiddenWordMapper.selectEnabled()).thenReturn(List.of(row("最佳", AD_LAW)));

        assertThatThrownBy(() -> service.assertClean("name", "标题", "全网最佳 宠物智能喂食器"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getHttpStatus()).isEqualTo(400);
                    assertThat(e.getCode()).isEqualTo(ErrorCodes.FORBIDDEN_WORD_HIT);
                    assertThat(e.getDetail()).isEqualTo("「标题」包含违禁词「最佳」（分类：广告法用语），请修改后重新提交");
                });
    }

    /**
     * COM-01 的参数通道：命中词与字段名以**数据**出一次（{@code errors[].field/value}），
     * 前端就不再需要从中文 detail 里正则捞字段（i18n.md §7.3 —— 捞出来的是中文，英文界面没法用）。
     * detail 照旧是那句中文：它是简体中文界面的文案，形状变了两头一起红。
     */
    @Test
    void 命中把字段与命中词作为数据出一次_前端不必再从detail里捞() {
        when(forbiddenWordMapper.selectEnabled()).thenReturn(List.of(row("最佳", AD_LAW)));

        assertThatThrownBy(() -> service.assertClean("name", "标题", "全网最佳"))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrors())
                        .isEqualTo(List.of(Map.of(
                                "field", "name",
                                "message", e.getDetail(),
                                "value", "最佳"))));
    }

    @Test
    void 分类标签随分类变_提示才真的可行动() {
        when(forbiddenWordMapper.selectEnabled()).thenReturn(List.of(row("刷单", FRAUD)));

        assertThatThrownBy(() -> service.assertClean("subtitle", "卖点", "支持刷单返现"))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getDetail())
                        .isEqualTo("「卖点」包含违禁词「刷单」（分类：欺诈与交易陷阱），请修改后重新提交"));
    }

    @Test
    void 干净文本与空文本_放行() {
        when(forbiddenWordMapper.selectEnabled()).thenReturn(List.of(row("最佳", AD_LAW)));

        assertThatCode(() -> service.assertClean("name", "标题", "宠物智能喂食器 定时定量")).doesNotThrowAnyException();
        assertThatCode(() -> service.assertClean("name", "标题", null)).doesNotThrowAnyException();
        assertThatCode(() -> service.assertClean("subtitle", "卖点", "  ")).doesNotThrowAnyException();
    }

    @Test
    void 多处命中_只报词表里第一个() {
        // 词表按分类升序进来（mapper 那条 ORDER BY），所以卖家先看到的是靠前的那一类；
        // 多列会把提示拖长，改完第一个再提交自然看到下一个
        when(forbiddenWordMapper.selectEnabled()).thenReturn(List.of(row("最佳", AD_LAW), row("刷单", FRAUD)));

        assertThatThrownBy(() -> service.assertClean("name", "标题", "全网最佳，还能刷单"))
                .isInstanceOfSatisfying(
                        BusinessException.class, e -> assertThat(e.getDetail()).contains("「最佳」"));
    }

    @Test
    void 连续判定只读一次词表_闸门不逐次扫全表() {
        when(forbiddenWordMapper.selectEnabled()).thenReturn(List.of(row("最佳", AD_LAW)));

        service.assertClean("name", "标题", "普通标题");
        service.assertClean("subtitle", "卖点", "普通卖点");

        verify(forbiddenWordMapper, times(1)).selectEnabled();
    }

    @Test
    void 词表缓存过期_重读一次_运营新加的词这才生效() {
        when(forbiddenWordMapper.selectEnabled())
                .thenReturn(List.of(row("最佳", AD_LAW)))
                .thenReturn(List.of(row("最佳", AD_LAW), row("第一", AD_LAW)));

        service.assertClean("name", "标题", "行业第一"); // 旧词表里没有「第一」，放行
        now.set(ForbiddenWordService.CACHE_MILLIS + 1);

        assertThatThrownBy(() -> service.assertClean("name", "标题", "行业第一"))
                .isInstanceOfSatisfying(
                        BusinessException.class, e -> assertThat(e.getDetail()).contains("「第一」"));
        verify(forbiddenWordMapper, times(2)).selectEnabled();
    }
}
