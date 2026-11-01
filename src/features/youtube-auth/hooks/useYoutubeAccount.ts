import { useEffect, useState } from "react";
import {
  fetchYoutubeAccounts,
  getYoutubeSessionKey,
  onYoutubeAuthChanged,
  selectedYoutubeAccount,
  type YoutubeAccount,
} from "@/shared/media/youtube";

interface LoadedAccounts {
  session: string;
  accounts: YoutubeAccount[];
}

export function useYoutubeAccount() {
  const [session, setSession] = useState(getYoutubeSessionKey);
  const [loaded, setLoaded] = useState<LoadedAccounts | null>(null);

  useEffect(() => onYoutubeAuthChanged(() => setSession(getYoutubeSessionKey())), []);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    fetchYoutubeAccounts(controller.signal)
      .catch((): YoutubeAccount[] => [])
      .then((accounts) => {
        if (!controller.signal.aborted) setLoaded({ session, accounts });
      });
    return () => controller.abort();
  }, [session]);

  const current = session && loaded?.session === session ? loaded : null;
  const accounts = current?.accounts ?? [];
  return {
    session,
    signedIn: session !== null,
    account: selectedYoutubeAccount(accounts),
    accounts,
    loading: session !== null && current === null,
  };
}
