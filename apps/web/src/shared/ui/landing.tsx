import type { ReactNode } from "react"
// LazyMotion + m：按需加载动画特性（domAnimation 含 variants/whileInView），省约 30kb 全量 motion 包
import { LazyMotion, domAnimation, m, useReducedMotion, type Variants } from "motion/react"

export const EASE = [0.16, 1, 0.3, 1] as const

export const STAGGER: Variants = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, delay: i * 0.1, ease: EASE },
    }),
}

export function LandingMotion({ children }: { children: ReactNode }) {
    return <LazyMotion features={domAnimation}>{children}</LazyMotion>
}

export function Reveal({
    children,
    className,
    delay = 0,
}: {
    children: ReactNode
    className?: string
    delay?: number
}) {
    const reduce = useReducedMotion()
    return (
        <m.div
            className={className}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, delay, ease: EASE }}
        >
            {children}
        </m.div>
    )
}

export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
    const reduce = useReducedMotion()
    return (
        <m.h2
            id={id}
            className="scroll-mt-20 text-3xl font-bold"
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: EASE }}
        >
            {children}
        </m.h2>
    )
}

export interface HeroImage {
    src: string
    alt: string
}

function HeroCollage({ images }: { images: [HeroImage, HeroImage, HeroImage] }) {
    const reduce = useReducedMotion()
    const fadeIn = (delay: number) => ({
        initial: reduce ? (false as const) : { opacity: 0, y: 32 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.8, delay, ease: EASE },
    })

    return (
        <div className="grid grid-cols-2 gap-4">
            <m.img
                src={images[0].src}
                alt={images[0].alt}
                className="mt-8 aspect-4/5 w-full rounded-lg object-cover"
                {...fadeIn(0.25)}
            />
            <div className="grid gap-4">
                {[images[1], images[2]].map((img, i) => (
                    <m.img
                        key={img.src}
                        src={img.src}
                        alt={img.alt}
                        className="aspect-4/3 w-full rounded-lg object-cover"
                        {...fadeIn(0.4 + i * 0.15)}
                    />
                ))}
            </div>
        </div>
    )
}

export function LandingHero({
    headline,
    body,
    actions,
    images,
}: {
    headline: ReactNode
    body: ReactNode
    actions: ReactNode
    images: [HeroImage, HeroImage, HeroImage]
}) {
    const reduce = useReducedMotion()

    return (
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 pt-20 pb-24 lg:grid-hero-split">
            <div className="space-y-6">
                {[headline, body, actions].map((block, i) => (
                    <m.div
                        /* eslint-disable-next-line react/no-array-index-key, react-doctor/no-array-index-key -- 三段固定结构，位置即身份 */
                        key={i}
                        custom={i}
                        variants={STAGGER}
                        initial={reduce ? false : "hidden"}
                        animate="show"
                    >
                        {block}
                    </m.div>
                ))}
            </div>

            <HeroCollage images={images} />
        </section>
    )
}

export function HeroHeadline({ children }: { children: ReactNode }) {
    return <h1 className="text-4xl leading-tight font-bold text-balance md:text-5xl">{children}</h1>
}

export function HeroBody({ children }: { children: ReactNode }) {
    return <p className="max-w-md text-lg text-muted-foreground">{children}</p>
}
