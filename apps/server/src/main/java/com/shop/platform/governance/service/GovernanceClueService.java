package com.shop.platform.governance.service;

import com.shop.platform.common.id.Ids;
import com.shop.platform.governance.api.GovernanceCommand;
import com.shop.platform.governance.mapper.GovernanceClueMapper;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * 违规线索的接收与查询。这一版只做"记下来、给人看"——
 * 处置（扣分、限流、处罚）和申诉是后续迁移的事，线索先攒着。
 */
@Component
public class GovernanceClueService implements GovernanceCommand {

    private final GovernanceClueMapper clues;

    public GovernanceClueService(GovernanceClueMapper clues) {
        this.clues = Objects.requireNonNull(clues, "clues");
    }

    @Override
    public void report(ViolationClue clue) {
        clues.insert(
                Ids.newId(),
                clue.kind().dbValue(),
                clue.merchantId(),
                clue.sellerOrderId(),
                clue.occurredAt(),
                clue.detail());
    }

    /** 管理端清单。status 为空 = 全部。 */
    public List<GovernanceClueMapper.ClueRow> list(String status, int limit) {
        return clues.find(status, limit);
    }
}
