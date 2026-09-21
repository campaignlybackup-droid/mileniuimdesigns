import { NextResponse, type NextRequest } from "next/server";
import { getStorefrontConfig, saveStorefrontSettings, type StorefrontCustomizationConfig } from "@/lib/cms/storefrontConfig";
import { requireStaffSession } from "@/lib/auth/actor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const marketCode = searchParams.get("market");
    const config = await getStorefrontConfig(marketCode);
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireStaffSession().catch(() => null);
    const body = await req.json();
    const { settings, marketCode } = body as {
      settings: Partial<StorefrontCustomizationConfig>;
      marketCode?: string;
    };

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid settings payload" },
        { status: 400 }
      );
    }

    await saveStorefrontSettings(settings, marketCode);
    const updated = await getStorefrontConfig(marketCode);

    return NextResponse.json({
      success: true,
      message: "Storefront customization settings saved successfully",
      config: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save settings" },
      { status: 500 }
    );
  }
}
