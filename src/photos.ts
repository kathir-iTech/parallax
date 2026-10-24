import catalog from "./data/venue-photos.json" with { type: "json" };
import type { Place } from "../core/types.ts";

export type VenuePhoto = {
  placeId: string;
  venue: string;
  asset: string;
  title: string;
  alt: string;
  author: string;
  source: string;
  license: string;
  licenseUrl: string;
  changes: string;
  position: string;
  variants: { src: string; width: number; height: number; bytes: number }[];
};

export const venuePhotos: readonly VenuePhoto[] = catalog;
const byId = new Map(venuePhotos.map((photo) => [photo.placeId, photo]));

// Match the provider's stable identity, never a fuzzy name or a generic city photo.
export function photoFor(place: Pick<Place, "id">) {
  return byId.get(place.id.toUpperCase());
}

export type PhotoUse = "result" | "comparison" | "thumbnail" | "map";
export const photoSizes: Record<PhotoUse, string> = {
  result:
    "(max-width: 600px) calc(100vw - 40px), (max-width: 900px) calc(100vw - 60px), (max-width: 1180px) calc(100vw - 387px), calc(100vw - 482px)",
  comparison:
    "(max-width: 600px) max(400px, 70vw), (max-width: 900px) calc((100vw - 80px) / 2), (max-width: 1180px) calc((100vw - 401px) / 2), calc((100vw - 502px) / 2)",
  thumbnail: "100px",
  map: "(max-width: 600px) calc(100vw - 80px), (max-width: 900px) 200px, 280px",
};
