import type { Captcha } from "@shop/api/sdk"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 图形验证码加载/刷新（对应后端 infra/captcha.CaptchaService）：维护 captchaId + image，captchaId 随发码上报、服务端一次性消费。
 * 与具体 API 实例解耦——调用方传入自己的 getCaptcha（web / seller 均可）；形状只借契约的 Captcha（captchaId + image），不借实例。
 */
export function useCaptcha(getCaptcha: () => Promise<Captcha>) {
    const [captchaId, setCaptchaId] = useState("")
    const [image, setImage] = useState("")
    const [loading, setLoading] = useState(false)
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
     * 清当前图与 id 但不拉新。与 reset 分工：reset 是「旧的已消费、立刻换一张能用的」，clear 是「接下来一段时间没有能用的图」（发码后倒计时那 60 秒）——
     * 这时拉新只会得到一张 60 秒内点不动、等能点又已过期的废图，还白耗一次匿名接口；倒计时结束再 refresh 即可
     */
    const clear = useCallback(() => {
        setCaptchaId("")
        setImage("")
    }, [])

    return { captchaId, image, loading, refresh, reset, clear }
}
