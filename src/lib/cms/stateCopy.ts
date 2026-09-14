import "server-only";
import { db } from "@/lib/db/client";

export type StateCopy = {
  headline: string;
  body: string | null;
  action: string | null;
};

export async function getStateCopy(stateKey: string): Promise<StateCopy> {
  let headline = "Nothing found";
  let body: string | null = "Some pieces are rare. Some pages are simply elsewhere.";
  let action: string | null = "RETURN HOME";

  try {
    const rows = await db.setting.findMany({
      where: {
        key: {
          in: [
            `copy.state.${stateKey}.headline`,
            `copy.state.${stateKey}.body`,
            `copy.state.${stateKey}.action`,
          ],
        },
      },
      select: { key: true, value: true },
    });

    for (const r of rows) {
      if (typeof r.value === "string") {
        if (r.key.endsWith(".headline")) headline = r.value;
        if (r.key.endsWith(".body")) body = r.value;
        if (r.key.endsWith(".action")) action = r.value;
      }
    }
  } catch {
    // DB error fallback
  }

  return { headline, body, action };
}
