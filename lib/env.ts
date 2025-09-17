import 'server-only'
import { z } from 'zod'

const Env = z.object({
    OPENAI_API_KEY: z.string().min(1),
    TRIPADVISOR_API_KEY: z.string().min(1),
    MAPTILER_API_KEY: z.string().min(1),
    APP_USER_AGENT: z.string().optional(),
})

export const env = Env.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    TRIPADVISOR_API_KEY: process.env.TRIPADVISOR_API_KEY,
    MAPTILER_API_KEY: process.env.MAPTILER_API_KEY,
    APP_USER_AGENT: process.env.APP_USER_AGENT,
})