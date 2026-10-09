import type { Captcha } from "@shop/api/sdk"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 图形验证码加载/刷新（人机验证，对应后端 infra/captcha.CaptchaService）。
 * 维护当前 captchaId + 图片；captchaId 随发码请求上报。
 *
 * 与具体 API 实例解耦：调用方传入自己的 getCaptcha（web / seller 的 authApi 均可），
 * 各端复用同一实现。captchaId 为服务端一次性消费，发码成功后应调用 reset() 换新图。
 * 形状只借契约的 `Captcha`（captchaId + image），不借实例——入参仍是调用方自己装配的函数。
 *
 * @param getCaptcha 匿名获取验证码的异步函数，返回契约的 `Captcha`
 */
export function useCaptcha(getCaptcha: () => Promise<Captcha>) {
    const [captchaId, setCaptchaId] = useState("")
    const [image, setImage] = useState("")
    const [loading, setLoading] = useState(false)
    // 防止重复点击并发刷新
    const inflight = useRef(false)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    const refresh = useCallback(async () => {
        if (inflight.current) return
        inflight.current = true
        if (mounted.current) setLoading(true)
        try {
            const res = await getCaptcha()
            if (mounted.current) {
                setCaptchaId(res.captchaId)
                setImage(res.image)
            }
        } catch {
            // 获取失败不致命：图与一次性 id 一起清掉，避免旧 id 与空图形成可提交的错配
            if (mounted.current) {
                setCaptchaId("")
                setImage("")
            }
        } finally {
            inflight.current = false
            if (mounted.current) setLoading(false)
        }
    }, [getCaptcha])

    /** 发码成功后换新图（token 一次性） */
    const reset = useCallback(() => {
        void refresh()
    }, [refresh])

    /**
     * 清掉当前图与 id，但**不**去拉新的。
     *
     * 与 reset 的分工：reset 是「旧的已消费，立刻换一张能用的」；clear 是「接下来一段时间内
     * 没有能用的图」（发码成功后倒计时那 60 秒），这时去拉新图只会得到一张 60 秒内点不动、
     * 等能点时又已过期的图——白白消耗一次匿名接口，还让用户对着废图输验证码。
     * 清空后控件回落到「点击获取」态，等倒计时结束再 refresh 即可。
     */
    const clear = useCallback(() => {
        setCaptchaId("")
        setImage("")
    }, [])

    return { captchaId, image, loading, refresh, reset, clear }
}
