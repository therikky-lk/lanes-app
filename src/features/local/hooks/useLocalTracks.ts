import { useEffect, useMemo, useState } from "react";
import {
  listLocalTracks,
  localRecordToTrack,
  onLocalTracksChange,
  type LocalTrackRecord,
} from "@/shared/media/local/localTracks";
import type { Track } from "@/shared/types";

export function useLocalTracks(): { records: LocalTrackRecord[]; tracks: Track[]; isLoading: boolean } {
  const [records, setRecords] = useState<LocalTrackRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () =>
      listLocalTracks()
        .then((list) => active && setRecords(list))
        .catch(() => active && setRecords([]))
        .finally(() => active && setIsLoading(false));
    void load();
    const off = onLocalTracksChange(() => void load());
    return () => {
      active = false;
      off();
    };
  }, []);

  const tracks = useMemo(() => records.map(localRecordToTrack), [records]);
  return { records, tracks, isLoading };
}
