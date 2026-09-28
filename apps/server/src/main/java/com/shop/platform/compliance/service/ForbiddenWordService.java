package com.shop.platform.compliance.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.compliance.api.ForbiddenCategory;
import com.shop.platform.compliance.mapper.ForbiddenWordMapper;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 违禁词闸门（COM-01）：读一次词表，在内存里判定，命中则抛 400。
 *
 * <p><b>词表带 TTL 缓存</b>（{@link #CACHE_MILLIS}）：闸门在每次商品写入与发布都要跑，
 * 一次 SELECT 一行不算贵，但词表将来上百行、写入路径又热时，不缓存就是每次写都扫全表；
 * 而运营改词表需要「一分钟内生效」即可，不必强一致（词表增删入口 P2 会在写后主动失效缓存）。
 *
 * <p><b>不过闸就是不过闸，没有 WARN 放行分支</b>：宁可误杀一次让卖家改文案，也不做「先上架后清理」——
 * 后者等于没有闸门。
 */
@Service
@RequiredArgsConstructor
public class ForbiddenWordService {

    /** 词表缓存 TTL：运营改词表最多一分钟生效 */
    static final long CACHE_MILLIS = 60_000L;

    private final ForbiddenWordMapper forbiddenWordMapper;

    /**
     * 时钟接缝（包内可换）：「运营改词表一分钟内生效」这条只有把时钟拨过 TTL 才验得到，
     * 否则测试只能真等 60 秒，或者干脆不测——不测就等于这条口径没人在守。
     */
    LongSupplier now = System::currentTimeMillis;

    /** 缓存的词表 + 它的读回时刻；单槽 AtomicReference，刷新时整体换掉（读侧要么看到旧的完整集、要么新的完整集） */
    private final AtomicReference<Cached> cache = new AtomicReference<>();

    private record Cached(List<ForbiddenWordMatcher.ForbiddenWordEntry> words, long loadedAt) {
        boolean expired(long at) {
            return at - loadedAt > CACHE_MILLIS;
        }
    }

    /** 当前生效的词表（缓存未过期则复用） */
    private List<ForbiddenWordMatcher.ForbiddenWordEntry> words() {
        long at = now.getAsLong();
        Cached current = cache.get();
        if (current != null && !current.expired(at)) {
            return current.words();
        }
        List<ForbiddenWordMatcher.ForbiddenWordEntry> fresh = forbiddenWordMapper.selectEnabled().stream()
                .map(row -> new ForbiddenWordMatcher.ForbiddenWordEntry(
                        row.getWord(), ForbiddenCategory.valueOf(row.getCategory())))
                .toList();
        cache.set(new Cached(fresh, at));
        return fresh;
    }

    /**
     * 判定一段公开文本是否干净；命中则抛 400（带命中词与分类）。
     *
     * @param fieldLabel 出错时告诉卖家是哪个字段（如「标题」「卖点」「评价内容」）
     * @param text 待判定的文本，可空（空 = 干净）
     */
    @Transactional(propagation = Propagation.SUPPORTS, readOnly = true)
    public void assertClean(String fieldLabel, String text) {
        List<ForbiddenWordMatcher.Hit> hits = ForbiddenWordMatcher.findAllHits(text, words());
        if (hits.isEmpty()) {
            return;
        }
        // 提示只带第一个命中的词与分类：多列会把消息拉长，卖家改第一个再提交自然看到下一个
        ForbiddenWordMatcher.Hit first = hits.getFirst();
        throw BusinessException.badRequest(
                ErrorCodes.FORBIDDEN_WORD_HIT,
                "「%s」包含违禁词「%s」（分类：%s），请修改后重新提交".formatted(fieldLabel, first.word(), categoryLabel(first.category())));
    }

    /** 分类的中文标签（写进提示文案；不新增 code——分类是提示的一部分，不是前端要分支的字段） */
    private static String categoryLabel(ForbiddenCategory category) {
        return switch (category) {
            case AD_LAW -> "广告法用语";
            case FRAUD -> "欺诈与交易陷阱";
            case PORN -> "色情低俗";
            case POLITICS -> "涉政敏感";
            case INFRINGEMENT -> "侵权与假冒";
            case OTHER -> "其他违规";
        };
    }
}
