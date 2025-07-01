import { NextResponse } from 'next/server'

export async function GET(request) {
  return NextResponse.json({ 
    message: 'Blackjack API is running',
    endpoints: {
      '/api/game': 'Game status',
      '/api/game/new': 'Start new game',
      '/api/game/hit': 'Hit (draw card)',
      '/api/game/stand': 'Stand (end turn)'
    }
  })
}

export async function POST(request) {
  const body = await request.json()
  
  return NextResponse.json({ 
    message: 'Game action received',
    action: body.action 
  })
}