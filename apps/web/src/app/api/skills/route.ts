import { NextRequest, NextResponse } from 'next/server';
import { loadSkills, toggleSkill } from '@/lib/data';

export const runtime = 'nodejs';

export async function GET() {
  const state = loadSkills();
  return NextResponse.json({ success: true, skills: state.skills });
}

export async function POST(req: NextRequest) {
  try {
    const { id, enabled } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const state = toggleSkill(String(id), Boolean(enabled));
    return NextResponse.json({ success: true, skills: state.skills });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
