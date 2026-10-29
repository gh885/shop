import { StaffLoginControllerApi, type StaffProfile } from "@shop/api/sdk"
import { createMeQuery } from "@shop/app-kit/data"

import { useAuthStatus } from "./api"

/**
 * 平台员工身份。
 *
 * <p>后端 `GET /api/staff/me` 一次给全：登录名、展示名、岗位、权限码清单、语言偏好。
 * 权限码是给导航画菜单用的（`undefined` = 还没拿到，按「未知即全显」处理），
 * 真正的闸门在每一个后端接口上——前端裁剪只是不让人点到会被拒的按钮。
 */
export type AdminAccount = StaffProfile

const me = createMeQuery<StaffProfile>({
    scope: "admin:me",
    queryFn: () => StaffLoginControllerApi.staffMe(),
    useAuthStatus,
    userIdOf: (value) => value.id,
})

export const { ME_QUERY_KEY } = me

export const useMe = me.useMe

export const useClearMe = me.useClearMe
