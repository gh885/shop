/**
 * auth —— 登录套件：LoginForm 与账号侧表单格式规则的 owner（手机号形状/位数、验证码位数、
 * 密码下限在 login-schema.ts；重发窗口与「码本身错了」的判据在 login-ui.ts）。
 * 邀请成员、注销确认这些入口复用同一条规则，不各写一份。
 */
export { LoginForm } from "./login-form"
export {
    CAPTCHA_CODE_DIGITS,
    NICKNAME_MAX,
    PHONE_DIGITS,
    PHONE_PATTERN,
    PASSWORD_MIN,
    PhoneSchema,
    SMS_CODE_DIGITS,
    SmsCodeSchema,
} from "./login-schema"
export { isCodeError, isSmsRateLimit, RESEND_COUNTDOWN_SECONDS } from "./login-ui"
export { useCountdown } from "./use-countdown"
export { usePasswordVisibility } from "./use-password-visibility"
