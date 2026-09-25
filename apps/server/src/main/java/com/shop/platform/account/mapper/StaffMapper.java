package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.common.PageParams;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface StaffMapper extends BaseMapper<Staff> {

    /** 按工号查员工（平台侧登录） */
    default Staff selectByEmployeeNo(String employeeNo) {
        return selectOne(new LambdaQueryWrapper<Staff>().eq(Staff::getEmployeeNo, employeeNo));
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
