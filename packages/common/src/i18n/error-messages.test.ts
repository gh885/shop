import { describe, expect, it } from "vitest"

import { ErrorCodes } from "../error-codes"
import { ERROR_MESSAGES, getErrorMessage } from "./error-messages"

describe("ERROR_MESSAGES", () => {
    it("covers every error code in both locales", () => {
        for (const code of Object.values(ErrorCodes)) {
            expect(ERROR_MESSAGES[code]["zh-CN"]).toBeTruthy()
            expect(ERROR_MESSAGES[code]["en-US"]).toBeTruthy()
        }
    })
})

describe("getErrorMessage", () => {
    it("returns localized text for known codes", () => {
        expect(getErrorMessage(ErrorCodes.SMS_CODE_INVALID, "en-US", "fallback")).toBe(
            "Incorrect verification code.",
        )
    })

    it("returns fallback for unknown codes", () => {
        expect(getErrorMessage("UNKNOWN_CODE", "zh-CN", "兜底")).toBe("兜底")
    })
})
