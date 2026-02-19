import { NextResponse } from 'next/server'
import { assertServerEnvInProduction, getServerEnv } from '@/lib/server/env'

const GOOGLE_PLACES_KEY = 'GOOGLE_PLACES_API_KEY'
assertServerEnvInProduction([GOOGLE_PLACES_KEY])
const API_KEY = getServerEnv(GOOGLE_PLACES_KEY)

const DEFAULT_DIMENSION = 200
const MIN_DIMENSION = 16
const MAX_DIMENSION = 800
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places'

function parseDimension(raw: string | null): number {
  if (!raw) return DEFAULT_DIMENSION
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_DIMENSION
  return Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, parsed))
}

function isValidPhotoName(name: string): boolean {
  if (!name.startsWith('places/') || !name.includes('/photos/')) return false
  if (name.includes('..')) return false
  if (/[?#\\]/.test(name)) return false
  return true
}

function isValidPlaceId(placeId: string): boolean {
  if (placeId.length < 5 || placeId.length > 200) return false
  if (/[?#/&\\]/.test(placeId)) return false
  if (placeId.includes('..')) return false
  return true
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function resolvePhotoNameFromPlaceId(placeId: string): Promise<string | null> {
  const detailsUrl = new URL(`${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`)
  detailsUrl.searchParams.set('languageCode', 'en')

  const details = await fetch(detailsUrl, {
    headers: {
      'X-Goog-Api-Key': API_KEY ?? '',
      'X-Goog-FieldMask': 'photos',
    },
    cache: 'force-cache',
  })

  if (!details.ok) {
    console.error('Google Place details request failed.', {
      status: details.status,
      statusText: details.statusText,
      placeId,
    })
    return null
  }

  const payload = (await details.json()) as {
    photos?: Array<{ name?: string }>
  }
  const resolvedName = payload.photos?.[0]?.name?.trim() ?? ''
  return isValidPhotoName(resolvedName) ? resolvedName : null
}

export async function GET(req: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_API_KEY is not configured. Please add it in your environment variables.' },
      { status: 500 }
    )
  }

  const url = new URL(req.url)
  const placeId = (url.searchParams.get('placeId') || '').trim()
  const directName = (url.searchParams.get('name') || '').trim()
  const maxHeightPx = parseDimension(url.searchParams.get('maxHeightPx'))
  const maxWidthPx = parseDimension(url.searchParams.get('maxWidthPx'))

  let name = ''
  if (directName) {
    if (!isValidPhotoName(directName)) {
      return NextResponse.json(
        { error: 'Invalid photo reference.' },
        { status: 400 }
      )
    }
    name = directName
  } else if (placeId) {
    if (!isValidPlaceId(placeId)) {
      return NextResponse.json(
        { error: 'Invalid place reference.' },
        { status: 400 }
      )
    }
    const resolvedName = await resolvePhotoNameFromPlaceId(placeId)
    if (!resolvedName) {
      return NextResponse.json(
        { error: 'No photo available for this place.' },
        { status: 404 }
      )
    }
    name = resolvedName
  }

  if (!name) {
    return NextResponse.json(
      { error: 'Missing photo reference.' },
      { status: 400 }
    )
  }

  const upstreamUrl = new URL(
    `https://places.googleapis.com/v1/${encodePath(name)}/media`
  )
  upstreamUrl.searchParams.set('maxHeightPx', String(maxHeightPx))
  upstreamUrl.searchParams.set('maxWidthPx', String(maxWidthPx))

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'X-Goog-Api-Key': API_KEY,
      },
      redirect: 'follow',
      cache: 'force-cache',
    })

    if (!upstream.ok || !upstream.body) {
      console.error('Google Places photo request failed.', {
        status: upstream.status,
        statusText: upstream.statusText,
      })
      return NextResponse.json(
        { error: 'Failed to load place photo.' },
        { status: 502 }
      )
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    console.error('Google Places photo request failed unexpectedly.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: 'Unable to load place photo at this time.' },
      { status: 502 }
    )
  }
}
