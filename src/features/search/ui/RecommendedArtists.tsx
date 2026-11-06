import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/languages";
import { usePopular } from "@/features/home/hooks/usePopularTracks";
import { useArtistAvatar } from "@/features/artist/hooks/useArtistAvatar";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useSearchHistoryStore } from "../store/searchHistoryStore";

function Avatar({ id, name, src }: { id: string; name: string; src: string }) {
  const url = useArtistAvatar(id, name, src);
  return url ? <CoverImage src={url} alt={name} fill sizes="100px" className="object-cover" /> : null;
}

export default function RecommendedArtists() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = usePopular(100);
  const addHistory = useSearchHistoryStore(state => state.addItem);
  const artists = data.filter(entry => entry.type === "artist").slice(0, 12);
  return <section className="px-[20px] pb-[24px] pt-[18px]">
    <h2 className="m-0 mb-[16px] text-[18px] font-semibold text-text-primary">{t("search.recommended_artists")}</h2>
    <div className="grid grid-cols-3 gap-x-[14px] gap-y-[20px]">
      {artists.map(entry => {
        if (entry.type !== "artist") return null;
        const artist = entry.item;
        return <button key={artist.id} type="button" className="min-w-0 border-0 bg-transparent p-0 text-center" onClick={() => {
          addHistory({ id: artist.id, type: "artist", title: artist.name, coverUrl: artist.imageUrl, itemData: { ...artist, title: artist.name, coverUrl: artist.imageUrl, _type: "artist" } });
          navigate(`/artist?id=${encodeURIComponent(artist.id)}`);
        }}>
          <span className="relative mb-[8px] block aspect-square w-full overflow-hidden rounded-full bg-bg-panel"><Avatar id={artist.id} name={artist.name} src={artist.imageUrl} /></span>
          <span className="block truncate text-[13px] text-text-primary">{artist.name}</span>
        </button>;
      })}
      {isLoading && artists.length === 0 && Array.from({ length: 6 }, (_, i) => <span key={i} className="aspect-square animate-pulse rounded-full bg-bg-panel" />)}
    </div>
  </section>;
}
