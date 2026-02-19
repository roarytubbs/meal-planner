import { NextResponse } from 'next/server'
import { assertServerEnvInProduction, getServerEnv } from '@/lib/server/env'

const GOOGLE_PLACES_KEY = 'GOOGLE_PLACES_API_KEY'
assertServerEnvInProduction([GOOGLE_PLACES_KEY])
const API_KEY = getServerEnv(GOOGLE_PLACES_KEY)

interface PlaceResult {
  placeId: string
  name: string
  address: string
  lat?: number
  lng?: number
  phone?: string
  hours?: string[]
  photoUrl?: string
}

interface GoogleOpeningHours {
  weekdayDescriptions?: string[]
}

interface GoogleLocation {
  latitude?: number
  longitude?: number
}

interface GooglePhoto {
  name?: string
}

interface GoogleDisplayName {
  text?: string
}

interface GooglePlace {
  id?: string
  displayName?: GoogleDisplayName
  formattedAddress?: string
  location?: GoogleLocation
  internationalPhoneNumber?: string
  currentOpeningHours?: GoogleOpeningHours
  regularOpeningHours?: GoogleOpeningHours
  photos?: GooglePhoto[]
}

interface RankedResult extends PlaceResult {
  metadataScore: number
  exactAddressBoost: number
  sourceOrder: number
}

const PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const MAX_RESULTS = 5
const GROCERY_FALLBACK_PREFIX = 'grocery store near '

function toPlaceResult(
  place: GooglePlace,
  sourceOrder: number,
  normalizedQuery: string
): RankedResult | null {
  const placeId = place.id
  if (!placeId) return null

  const openingHours = place.regularOpeningHours ?? place.currentOpeningHours
  const hours = openingHours?.weekdayDescriptions ?? undefined

  let photoUrl: string | undefined
  const photoRef = place.photos?.[0]?.name
  if (photoRef) {
    photoUrl = `/api/places/photo?placeId=${encodeURIComponent(placeId)}&maxHeightPx=200&maxWidthPx=200`
  }

  const name = place.displayName?.text ?? ''
  const address = place.formattedAddress ?? ''
  const phone = place.internationalPhoneNumber ?? undefined
  const lat = place.location?.latitude
  const lng = place.location?.longitude

  let metadataScore = 0
  if (phone) metadataScore += 1
  if (hours && hours.length > 0) metadataScore += 1
  if (photoUrl) metadataScore += 1

  const exactAddressBoost =
    address.toLowerCase() === normalizedQuery.toLowerCase() ? 1 : 0

  return {
    placeId,
    name,
    address,
    lat,
    lng,
    phone,
    hours,
    photoUrl,
    metadataScore,
    exactAddressBoost,
    sourceOrder,
  }
}

async function runTextSearch(
  apiKey: string,
  textQuery: string,
  sourceOffset: number
): Promise<{ results: RankedResult[]; status: number | null }> {
  const searchRes = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.currentOpeningHours,places.regularOpeningHours,places.photos',
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: MAX_RESULTS,
    }),
  })

  if (!searchRes.ok) {
    console.error('Google Places search request failed.', {
      status: searchRes.status,
      statusText: searchRes.statusText,
      query: textQuery,
    })
    return { results: [], status: searchRes.status }
  }

  const searchData = await searchRes.json()
  const places = (searchData.places ?? []) as GooglePlace[]
  const normalizedQuery = textQuery.trim()
  const results = places
    .map((place, index) => toPlaceResult(place, sourceOffset + index, normalizedQuery))
    .filter((place): place is RankedResult => place !== null)

  return { results, status: null }
}

function needsGroceryFallback(results: RankedResult[]): boolean {
  if (results.length === 0) return true
  const first = results[0]
  return first.metadataScore === 0
}

function mergeAndRankResults(
  primary: RankedResult[],
  fallback: RankedResult[]
): PlaceResult[] {
  const byPlaceId = new Map<string, RankedResult>()
  const combined = [...primary, ...fallback]
  for (const result of combined) {
    const existing = byPlaceId.get(result.placeId)
    if (!existing) {
      byPlaceId.set(result.placeId, result)
      continue
    }

    const shouldReplace =
      result.metadataScore > existing.metadataScore ||
      (result.metadataScore === existing.metadataScore &&
        result.exactAddressBoost > existing.exactAddressBoost) ||
      (result.metadataScore === existing.metadataScore &&
        result.exactAddressBoost === existing.exactAddressBoost &&
        result.sourceOrder < existing.sourceOrder)

    if (shouldReplace) {
      byPlaceId.set(result.placeId, result)
    }
  }

  return Array.from(byPlaceId.values())
    .sort((a, b) => {
      if (b.metadataScore !== a.metadataScore) {
        return b.metadataScore - a.metadataScore
      }
      if (b.exactAddressBoost !== a.exactAddressBoost) {
        return b.exactAddressBoost - a.exactAddressBoost
      }
      return a.sourceOrder - b.sourceOrder
    })
    .slice(0, MAX_RESULTS)
    .map(({ metadataScore, exactAddressBoost, sourceOrder, ...result }) => result)
}

// Google Places API (New) - Text Search
export async function POST(req: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_API_KEY is not configured. Please add it in your environment variables.' },
      { status: 500 }
    )
  }

  let query = ''
  try {
    const body = await req.json()
    query = typeof body?.query === 'string' ? body.query : ''
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 }
    )
  }

  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 3 || normalizedQuery.length > 200) {
    return NextResponse.json(
      { error: 'Query must be between 3 and 200 characters.' },
      { status: 400 }
    )
  }

  try {
    const primarySearch = await runTextSearch(API_KEY, normalizedQuery, 0)
    if (primarySearch.status !== null) {
      return NextResponse.json(
        { error: 'Failed to search places' },
        { status: primarySearch.status }
      )
    }

    let fallbackResults: RankedResult[] = []
    if (needsGroceryFallback(primarySearch.results)) {
      const fallbackQuery = `${GROCERY_FALLBACK_PREFIX}${normalizedQuery}`
      const fallbackSearch = await runTextSearch(API_KEY, fallbackQuery, 1000)
      if (fallbackSearch.status !== null) {
        return NextResponse.json(
          { error: 'Failed to search places' },
          { status: fallbackSearch.status }
        )
      }
      fallbackResults = fallbackSearch.results
    }

    const results = mergeAndRankResults(primarySearch.results, fallbackResults)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Places API request failed unexpectedly.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: 'Internal server error while searching places' },
      { status: 500 }
    )
  }
}
