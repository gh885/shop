package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.model.StaffRole;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.common.PageParams;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface StaffMapper extends BaseMapper<Staff> {

    /** 按工号查员工（平台侧登录） */
    default Staff selectByEmployeeNo(String employeeNo) {
        return selectOne(new LambdaQueryWrapper<Staff>().eq(Staff::getEmployeeNo, employeeNo));
    }

    /** 员工号是否已被占用（全表口径，不看状态——被禁员工仍占位，与登录账号同一存续口径） */
    default boolean existsByEmployeeNo(String employeeNo) {
        return selectCount(new LambdaQueryWrapper<Staff>().eq(Staff::getEmployeeNo, employeeNo)) > 0;
    }

    /**
     * 在岗超管人数（末位保护的口径：只数 ACTIVE 的超管）。
     *
     * <p>没有这个计数就无法判「降级/禁用掉的是不是最后一个在岗超管」——而那一步一旦漏掉，
     * 平台就再也没有人能创建员工、调岗位、封店了（STAFF_MANAGE 只有通配可达）。
     *
     * <p><b>这个计数只有在 {@link #lockSuperAdminGovernance()} 之后读才作数</b>：它数的是一个聚合，
     * 行级条件更新（{@code WHERE status = ACTIVE}）挡得住「同一行被抢着改两次」，挡不住
     * 「两个最后超管被同时禁用」——两边的写各不碰对方的行，各自的计数都还看见对方在岗。
     */
    default long countActiveSuperAdmins() {
        return selectCount(new LambdaQueryWrapper<Staff>()
                .eq(Staff::getRole, StaffRole.SUPER_ADMIN.name())
                .eq(Staff::getStatus, StaffStatus.ACTIVE));
    }

    /** 末位超管串行闸的咨询锁键，见 {@link #lockSuperAdminGovernance()} */
    long SUPER_ADMIN_GOVERNANCE_LOCK = 0x53484F505F53414CL;

    /**
     * 「末位超管」这条聚合判定的串行闸：一把事务级咨询锁，提交即释放。
     *
     * <p>为什么是咨询锁而不是行锁：要在读计数之前锁住「其他在岗超管」那几行，两个事务会各自先拿到对方行的
     * 共享锁、再抢主写锁，正好凑成一个环（PG 直接报 deadlock_detected，治理动作变成 500）。这类动作一天没有
     * 几次、全是人在管理端点的，串行化的代价可以忽略。
     *
     * <p>键拼出来是 "SHOP_SAL"（SA = super admin，L = lock）。取值不参与业务，但改了就等于换一把锁，
     * 别在第二处复用同一个数。
     *
     * <p>返回的是 PG 的 void（恒为 null），没人读它；声明成 {@code String} 只为让 MyBatis 认这条 SELECT。
     * 必须在事务里调用，否则锁在语句结束即释放（{@code _xact_} 语义），等于没锁。
     */
    @Select("SELECT pg_advisory_xact_lock(" + SUPER_ADMIN_GOVERNANCE_LOCK + ")")
    String lockSuperAdminGovernance();

    /**
     * 禁用员工：只推 ACTIVE 行。{@code WHERE status = ACTIVE} 是并发闸门——两人同时点同一个人的禁用，
     * 后到者 0 行，于是不重复吊销会话、不往账本里补第二行（口径同 {@link #updateRole}）。
     */
    default int disable(UUID staffId, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<Staff>()
                        .eq(Staff::getId, staffId)
                        .eq(Staff::getStatus, StaffStatus.ACTIVE)
                        .set(Staff::getStatus, StaffStatus.DISABLED)
                        .set(Staff::getUpdatedAt, now));
    }

    /** 启用员工：只推 DISABLED 行；对已启用的再启用是空动作，0 行交回调用方报 409，不静默「成功」 */
    default int enable(UUID staffId, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<Staff>()
                        .eq(Staff::getId, staffId)
                        .eq(Staff::getStatus, StaffStatus.DISABLED)
                        .set(Staff::getStatus, StaffStatus.ACTIVE)
                        .set(Staff::getUpdatedAt, now));
    }

    /**
     * 调岗位：把员工的 role 改成目标岗位名。
     *
     * <p>{@code WHERE role <> 目标角色}：同岗位的重复下发与并发的第二次调岗都影响 0 行，调用方据此报 409
     * （此前只按 id 更新，任何后到者都算「改成功」，账本里因此多出第二条调岗记录）。
     */
    default int updateRole(UUID staffId, String role) {
        return update(
                null,
                new LambdaUpdateWrapper<Staff>()
                        .eq(Staff::getId, staffId)
                        .ne(Staff::getRole, role)
                        .set(Staff::getRole, role));
    }

    /**
     * 管理端员工列表分页：新建账号在前（创建时间倒序，新员工是运营最可能要找的那一个）。
     *
     * <p>status 传 null = 全部档：被禁员工也要筛得出来，否则治理列表看不到自己要处理的号。
     *
     * <p>keyword 是「工号<b>或</b>展示名任一命中」的一条 OR，两列都按库中原值做包含匹配；口令哈希不参与匹配
     * （哪些列能过 HTTP 边界，由 service 折成 AdminStaffItem 时决定）。
     */
    default Page<Staff> selectPageAdmin(PageParams pageParams, StaffStatus status, String keyword) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<Staff>()
                        .eq(status != null, Staff::getStatus, status)
                        .and(
                                keyword != null,
                                q -> q.like(Staff::getEmployeeNo, keyword).or().like(Staff::getDisplayName, keyword))
                        .orderByDesc(Staff::getCreatedAt));
    }
}
