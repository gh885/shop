package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.model.StaffRole;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.common.PageParams;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

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
     */
    default long countActiveSuperAdmins() {
        return selectCount(new LambdaQueryWrapper<Staff>()
                .eq(Staff::getRole, StaffRole.SUPER_ADMIN.name())
                .eq(Staff::getStatus, StaffStatus.ACTIVE));
    }

    /**
     * 调岗位：把员工的 role 改成目标岗位名。
     *
     * <p>{@code WHERE role = 目标角色} 的守卫写在 service 的自指/末位检查之后，条件更新这里只保证
     * 「不是那一行就不改」；返回值 0 即并发下岗位已被别人改掉，调用方据此报 409。
     */
    default int updateRole(UUID staffId, String role) {
        return update(
                null, new LambdaUpdateWrapper<Staff>().eq(Staff::getId, staffId).set(Staff::getRole, role));
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
