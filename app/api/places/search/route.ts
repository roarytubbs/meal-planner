import { NextResponse } from 'next/server'

const API_KEY = process.env.GOOGLE_PLACES_API_KEY

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

// Google Places API (New) - Text Search
export async function POST(req: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_API_KEY is not configured. Please add it in your environment variables.' },
      { status: 500 }
    )
  }

  const body = await req.json()
  const { query } = body as { query?: string }

  if (!query || query.trim().length < 3) {
    return NextResponse.json(
      { error: 'Query must be at least 3 characters' },
      { status: 400 }
    )
  }

  try {
    // Step 1: Text Search to find the place
    const searchRes = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.currentOpeningHours,places.regularOpeningHours,places.photos',
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: 5,
        }),
      }
    )

    if (!searchRes.ok) {
      const errText = await searchRes.text()
      console.error('Google Places search error:', errText)
      return NextResponse.json(
        { error: 'Failed to search places' },
        { status: searchRes.status }
      )
    }

    const searchData = await searchRes.json()
    const places = searchData.places ?? []

    const results: PlaceResult[] = await Promise.all(
      places.map(async (place: Record<string, unknown>): Promise<PlaceResult> => {
        // Extract hours
        const openingHours = (place.regularOpeningHours ?? place.currentOpeningHours) as {
          weekdayDescriptions?: string[]
        } | undefined
        const hours = openingHours?.weekdayDescriptions ?? undefined

        // Get photo URL if available
        let photoUrl: string | undefined
        const photos = place.photos as { name?: string }[] | undefined
        if (photos?.[0]?.name) {
          const photoRef = photos[0].name
          // Use the Place Photos (New) endpoint
          photoUrl = `https://places.googleapis.com/v1/${photoRef}/media?key=${API_KEY}&maxHeightPx=200&maxWidthPx=200`
        }

        const displayName = place.displayName as { text?: string } | undefined
        const location = place.location as { latitude?: number; longitude?: number } | undefined

        return {
          placeId: place.id as string,
          name: displayName?.text ?? '',
          address: (place.formattedAddress as string) ?? '',
          lat: location?.latitude,
          lng: location?.longitude,
          phone: (place.internationalPhoneNumber as string) ?? undefined,
          hours,
          photoUrl,
        }
      })
    )

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Places API error:', error)
    return NextResponse.json(
      { error: 'Internal server error while searching places' },
      { status: 500 }
    )
  }
}
