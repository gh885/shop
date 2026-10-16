export { SELLER_URL } from "./env"

export function isExternalTarget(to: string): boolean {
    return to.startsWith("http")
}
