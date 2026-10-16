/** auth 登录套件：格式规则 owner 在 login-schema.ts，交互判据在 login-ui.ts，字段积木在 fields.tsx */
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
