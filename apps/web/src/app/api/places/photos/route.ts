// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface PlacePhoto {
  photoName: string
  thumbnailUri: string
  attributions: string[]
}

const MAX_PHOTOS = 5

const PLACE_ID_RE = /^[A-Za-z0-9_-]+$/

export async function GET(req: Request) {
  const { error } = await getAuthContext()
  if (error) return error

  const apiKey = process.env['GOOGLE_MAPS_API_KEY']
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const placeId = searchParams.get('placeId')?.trim()
  if (!placeId) return NextResponse.json({ error: 'placeId is required' }, { status: 400 })
  if (!PLACE_ID_RE.test(placeId)) return NextResponse.json({ error: 'Invalid placeId' }, { status: 400 })

  let detailRes: Response
  try {
    detailRes = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'photos',
      },
    })
  } catch (err) {
    console.error('[/api/places/photos] place detail fetch error:', err)
    return NextResponse.json([])
  }

  if (!detailRes.ok) return NextResponse.json([])

  const detail = await detailRes.json() as { photos?: unknown[] }
  const photos = (detail.photos ?? []).slice(0, MAX_PHOTOS) as Array<{
    name: string
    authorAttributions?: Array<{ displayName?: string }>
  }>

  if (photos.length === 0) return NextResponse.json([])

  const results = await Promise.all(photos.map(async (photo) => {
    try {
      const mediaRes = await fetch(
        `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=400&skipHttpRedirect=true&key=${apiKey}`,
      )
      if (!mediaRes.ok) return null
      const media = await mediaRes.json() as { photoUri?: string }
      if (!media.photoUri) return null
      return {
        photoName: photo.name,
        thumbnailUri: media.photoUri,
        attributions: (photo.authorAttributions ?? [])
          .map(a => a.displayName)
          .filter((n): n is string => Boolean(n)),
      } satisfies PlacePhoto
    } catch {
      return null
    }
  }))

  return NextResponse.json(results.filter((r): r is PlacePhoto => r !== null))
}
