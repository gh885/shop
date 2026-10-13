/**
 * auth —— 登录套件：LoginForm 与账号侧表单格式规则的 owner（手机号形状/位数、验证码位数、
 * 密码下限在 login-schema.ts；重发窗口与「码本身错了」的判据在 login-ui.ts）。
 * 邀请成员、注销确认这些入口复用同一条规则，不各写一份。
 *
 * 字段级积木（一行文本输入 / 口令 / 提交按钮）在 fields.tsx：店主与子账号两套登录表单、
 * 以及卖家端新建子账号那两张表单，画的都是同一种「字段行」。
 */
export { LoginForm } from "./login-form"
export {
    PasswordField,
    SubmitButton,
    TextField,
    type SubmitButtonProps,
    type TextFieldApi,
    type TextFieldProps,
} from "./fields"
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
export { isCaptchaError, isCodeError, isSmsRateLimit, RESEND_COUNTDOWN_SECONDS } from "./login-ui"
export { useCaptcha } from "./use-captcha"
export { useCountdown } from "./use-countdown"
export { usePasswordVisibility } from "./use-password-visibility"
