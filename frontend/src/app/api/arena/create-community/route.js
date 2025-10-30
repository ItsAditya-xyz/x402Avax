import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

const ARENA_ENDPOINT = 'https://api.arena.social/communities/create-community';

export async function POST(request) {
  try {
    const jwt = process.env.ARENA_JWT;
    if (!jwt) {
      return NextResponse.json({ error: 'ARENA_JWT missing on server' }, { status: 500 });
    }

    const incoming = await request.json().catch(() => ({}));

    // Default test payload if none provided from client
    const payload = Object.keys(incoming).length ? incoming : {
      name: 'test',
      photoURL: 'https://static.starsarena.com/uploads/5be586d2-2bbc-1ff1-6a09-edc2348459b61761821011736.jpeg',
      ticker: 'TEST',
      tokenName: 'test',
      whitelist: {
        includedCommunities: [],
        includesCSV: false,
        startDate: 1761821045,
        duration: 3600,
        maxAllocation: 50000000,
        walletCount: 0,
        addresses: ''
      },
      address: '0x19381f7f8ae7e304a58de7a551dbcfc60f4892fa',
      paymentToken: 'arena'
    };

    const res = await fetch(ARENA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      return NextResponse.json({ error: 'Arena API error', status: res.status, data }, { status: res.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected server error', message: err?.message || String(err) }, { status: 500 });
  }
}
