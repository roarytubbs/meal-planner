import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __mealPlannerPrisma__: PrismaClient | undefined
}

export const db =
  globalThis.__mealPlannerPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__mealPlannerPrisma__ = db
}
