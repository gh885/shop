import { z } from "zod"

const urlEnv = (fallback: string) => (import.meta.env.PROD ? z.url() : z.url().catch(fallback))

const originEnv = (fallback: string) => {
    const schema = z.url().transform((value) => new URL(value).origin)
    return import.meta.env.PROD ? schema : schema.catch(fallback)
}

export const BACKEND_URL = urlEnv("http://localhost:8080").parse(import.meta.env.VITE_BACKEND_URL)

export const SELLER_URL = urlEnv("http://localhost:5000").parse(import.meta.env.VITE_SELLER_URL)

export const SITE_ORIGIN = originEnv("http://localhost:3000").parse(
    import.meta.env.VITE_SITE_ORIGIN,
)
