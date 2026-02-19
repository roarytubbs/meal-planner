import { NextResponse } from 'next/server'
import { handleCartSessionRequest } from '@/lib/server/shopping-cart-route'

export async function POST(request: Request) {
  const result = await handleCartSessionRequest(request)
  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  })
}
