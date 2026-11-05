package com.shop.platform.governance.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.EntityStatus;
import com.shop.platform.common.id.Ids;
import com.shop.platform.governance.api.ForbiddenWordQuery;
import com.shop.platform.governance.mapper.ForbiddenWordMapper;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 违禁词：公开文本包含任一词即命中。
 *
 * <p>归一化（NFKC + trim + lowercase）在两边都做：词表入库前做一次，待检文本查询前做一次。
 * 不做词干/拼音，误杀和漏杀的代价都由运营的词表承担——这里只保证「同一个词的不同写法能命中」。
 */
@Component
public class ForbiddenWordService implements ForbiddenWordQuery {

    private final ForbiddenWordMapper words;
    private final AuditCommand audit;

    public ForbiddenWordService(ForbiddenWordMapper words, AuditCommand audit) {
        this.words = Objects.requireNonNull(words, "words");
        this.audit = Objects.requireNonNull(audit, "audit");
    }

    @Override
    public Optional<String> firstHit(String text) {
        if (text == null || text.isBlank()) {
            return Optional.empty();
        }
        return words.firstHit(normalize(text));
    }

    public List<ForbiddenWordMapper.Row> list(String status, String keyword) {
        return words.list(status, keyword);
    }

    @Transactional
    public UUID create(String word, UUID operatorId) {
        String normalized = normalize(word);
        if (normalized.isEmpty()) {
            throw BusinessException.badRequest("违禁词不能为空");
        }
        if (words.exists(normalized)) {
            throw BusinessException.conflict("违禁词已存在: " + word);
        }
        UUID id = Ids.newId();
        words.insert(id, normalized, operatorId);
        audit.record(AuditEntry.byStaff(
                "governance.forbidden_word.created",
                "forbidden_word",
                id.toString(),
                operatorId,
                null,
                Map.of("word", FieldChange.to(normalized))));
        return id;
    }

    @Transactional
    public void updateStatus(UUID id, String status, UUID operatorId) {
        if (!EntityStatus.ALL.contains(status)) {
            throw BusinessException.badRequest("违禁词状态只能是 active / disabled: " + status);
        }
        if (words.updateStatus(id, status) == 0) {
            throw BusinessException.notFound("违禁词不存在或状态未变化: " + id);
        }
        audit.record(AuditEntry.byStaff(
                "governance.forbidden_word.status_changed",
                "forbidden_word",
                id.toString(),
                operatorId,
                null,
                Map.of("status", FieldChange.to(status))));
    }

    private static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT);
    }
}
