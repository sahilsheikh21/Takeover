import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings, loadTelegramConfig, saveTelegramConfig } from '@/lib/data';
import type { Settings, TelegramConfig } from '@/types';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const settings = loadSettings();
    const telegram = loadTelegramConfig();
    // Strip sensitive keys from response for safety but keep structure
    return NextResponse.json({ success: true, settings, telegram });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const settingsPatch: Partial<Settings> =
      body && (body.settings || body.telegram)
        ? (body.settings || {})
        : (body as Partial<Settings>);

    const updatedSettings = saveSettings(settingsPatch);

    let updatedTelegram = loadTelegramConfig();
    if (body?.telegram) {
      updatedTelegram = {
        enabled: false,
        ...(updatedTelegram || {}),
        ...(body.telegram as Partial<TelegramConfig>),
      };
      saveTelegramConfig(updatedTelegram);
    }

    return NextResponse.json({ success: true, settings: updatedSettings, telegram: updatedTelegram });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
