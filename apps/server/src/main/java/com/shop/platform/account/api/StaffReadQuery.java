package com.shop.platform.account.api;

import com.shop.platform.account.mapper.Staff;
import com.shop.platform.account.mapper.StaffMapper;
import com.shop.platform.common.Text;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 平台员工只读查询（跨模块消费）。
 *
 * <p>存在的理由是审计账本：治理动作落在 shop / coupon / logistics 模块里，而「谁做的」这一格属于 account。
 * 审计写入与动作同事务，这里按主键点查一次，不给批量版本 —— 一次治理动作只有一个操作人。
 *
 * <p>查无此人（员工被删）返回 null：审计行必须照样写下去，操作人显示名退化为空，
 * 绝不因为「查不到名字」就让整个动作回滚 —— 那是拿追责能力换一次治理动作的成功。
 */
@Component
@RequiredArgsConstructor
public class StaffReadQuery {

    private final StaffMapper staffMapper;

    /** 员工展示名；查无此人或名字为空时给 null（调用方按「未知操作人」展示） */
    public String displayNameById(UUID staffId) {
        if (staffId == null) {
            return null;
        }
        Staff staff = staffMapper.selectById(staffId);
        return staff == null ? null : Text.blankToNull(staff.getDisplayName());
    }
}
