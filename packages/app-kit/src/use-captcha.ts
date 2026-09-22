import { useCallback, useRef, useState } from "react"

/**
 * 图形验证码加载/刷新（人机验证，对应后端 infra/captcha.CaptchaService）。
 * 维护当前 captchaId + 图片；captchaId 随发码请求上报。
 *
 * 与具体 API 实例解耦：调用方传入自己的 getCaptcha（web / seller 的 authApi 均可），
 * 各端复用同一实现。captchaId 为服务端一次性消费，发码成功后应调用 reset() 换新图。
 *
 * @param getCaptcha 匿名获取验证码的异步函数，返回 { captchaId, image }
 */
export function useCaptcha(getCaptcha: () => Promise<{ captchaId: string; image: string }>) {
    const [captchaId, setCaptchaId] = useState("")
    const [image, setImage] = useState("")
    const [loading, setLoading] = useState(false)
    // 防止重复点击并发刷新
    const inflight = useRef(false)

    const refresh = useCallback(async () => {
        if (inflight.current) return
        inflight.current = true
        setLoading(true)
        try {
            const res = await getCaptcha()
            setCaptchaId(res.captchaId)
            setImage(res.image)
        } catch {
            // 获取失败不致命：清空图触发重试，用户可再次点击
            setImage("")
        } finally {
            inflight.current = false
            setLoading(false)
        }
    }, [getCaptcha])

    /** 发码成功后换新图（token 一次性） */
    const reset = useCallback(() => {
        void refresh()
    }, [refresh])

    return { captchaId, image, loading, refresh, reset }
}
