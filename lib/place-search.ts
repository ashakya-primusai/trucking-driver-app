export type PlaceSuggestion = {
  id: string;
  label: string;
  lat: number;
  lng: number;
};

type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
};

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error("Place search failed. Try again.");
  }

  const rows = (await res.json()) as NominatimResult[];
  return rows
    .map((row) => {
      const lat = Number(row.lat);
      const lng = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: String(row.place_id),
        label: row.display_name,
        lat,
        lng,
      };
    })
    .filter((x): x is PlaceSuggestion => x !== null);
}
