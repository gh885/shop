import { authApi } from "#/shared/api/client"

/** 当前登录用户信息 */
export function me() {
    return authApi.me()
}
