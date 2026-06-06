// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

interface AutocompleteSuggestion {
  placeId: string
  description: string
  mainText?: string
  secondaryText?: string
}

export async function GET(req: Request) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const input = searchParams.get('input')?.trim()
  if (!input || input.length < 2) return NextResponse.json([])

  let res: Response
  try {
    res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({ input, languageCode: 'ja' }),
    })
  } catch (err) {
    console.error('[/api/places/autocomplete] fetch error:', err)
    return NextResponse.json([])
  }

  if (!res.ok) return NextResponse.json([])

  const data = await res.json() as { suggestions?: unknown[] }
  const suggestions: AutocompleteSuggestion[] = (data.suggestions ?? [])
    .map((s: unknown) => {
      const pred = (s as { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }).placePrediction
      if (!pred?.placeId || !pred.text?.text) return null
      return {
        placeId: pred.placeId,
        description: pred.text.text,
        mainText: pred.structuredFormat?.mainText?.text,
        secondaryText: pred.structuredFormat?.secondaryText?.text,
      }
    })
    .filter((s): s is AutocompleteSuggestion => s !== null)

  return NextResponse.json(suggestions)
}
