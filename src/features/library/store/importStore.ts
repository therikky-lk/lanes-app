import { create } from "zustand";
import type { ImportJob, ImportReview } from "@/shared/api";
import type { ImportSource, Track } from "@/shared/contracts";
import { notifyLibraryChanged } from "../hooks/usePlaylists";
import { detectImportSource } from "../services/import";
import { matchPlaylist, runClientImport, type ImportProgress } from "../services/import/manager/clientImportManager";
import type { ClientImportedPlaylist } from "../services/import/importTypes";
import {
  createLocalImportJob,
  finalizeLocalImport,
  onLocalImportJobChange,
  updateLocalImportJob,
} from "../services/import/manager/localImportJobs";
import { useModalStore, type TrackDetail } from "./modalStore";
import { watchPendingTrackAfterImport } from "./importPendingTrack";

export interface ActiveImportState {
  job: ImportJob | null;
  isPolling: boolean;
  error: string | null;
  pendingTrack: TrackDetail | null;
  reviewItems: ImportReview[] | null;
  approvedTracks: Track[] | null;
  startImport: (url: string, pendingTrack?: TrackDetail | null) => Promise<ImportJob>;
  startFileImport: (playlist: ClientImportedPlaylist) => Promise<ImportJob>;
  cancelPolling: () => void;
  reset: () => void;
}

let activeAbortController: AbortController | null = null;

function cleanupActiveImport() {
  activeAbortController?.abort();
  activeAbortController = null;
}

function progressPatch(progress: ImportProgress): Partial<ImportJob> {
  return {
    status: "running",
    result: progress.result,
    ...(progress.title ? { title: progress.title } : {}),
    ...(progress.description ? { description: progress.description } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Import failed";
}

export const useImportStore = create<ActiveImportState>((set, get) => {
  async function startJob(source: ImportSource, url: string, pendingTrack: TrackDetail | null, playlist?: ClientImportedPlaylist) {
    get().cancelPolling();
    const job = createLocalImportJob(source, url.trim());
    const controller = new AbortController();
    activeAbortController = controller;
    set({ job, error: null, isPolling: true, pendingTrack, reviewItems: null, approvedTracks: null });

    void (async () => {
      try {
        const options = {
          signal: controller.signal,
          onProgress: (progress: ImportProgress) => updateLocalImportJob(job.id, progressPatch(progress)),
        };
        const outcome = await (playlist ? matchPlaylist(playlist, options) : runClientImport(url, options));
        if (controller.signal.aborted) return;
        const meta = { title: outcome.title, description: outcome.description, result: outcome.result };

        if (outcome.reviewItems.length > 0) {
          updateLocalImportJob(job.id, { ...meta, status: "awaiting_decision", requiresDecision: true }, outcome.reviewItems);
          set({ isPolling: false, reviewItems: outcome.reviewItems, approvedTracks: outcome.approvedTracks });
          useModalStore.setState({ importReviewPrefetched: outcome.reviewItems, importReviewApprovedTracks: outcome.approvedTracks });
          useModalStore.getState().openImportReview(job.id, outcome.reviewItems, outcome.approvedTracks);
          return;
        }

        updateLocalImportJob(job.id, meta);
        await finalizeLocalImport(job.id, outcome.approvedTracks, outcome.title, outcome.description);
        set({ isPolling: false });
        notifyLibraryChanged();
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = errorMessage(error);
        updateLocalImportJob(job.id, { status: "failed", error: { code: "IMPORT_FAILED", message } });
        set({ isPolling: false, error: message });
      } finally {
        if (activeAbortController === controller) activeAbortController = null;
      }
    })();

    return job;
  }
  return {
    job: null, isPolling: false, error: null, pendingTrack: null, reviewItems: null, approvedTracks: null,
    reset: () => {
      cleanupActiveImport();
      set({ job: null, isPolling: false, error: null, pendingTrack: null, reviewItems: null, approvedTracks: null });
    },
    cancelPolling: () => {
      cleanupActiveImport();
      set({ isPolling: false });
    },
    startImport: async (url, pendingTrack = null) => startJob(detectImportSource(url), url, pendingTrack),
    startFileImport: playlist => startJob(playlist.source, playlist.sourceUrl, null, playlist),
  };
});

onLocalImportJobChange((job) => {
  if (useImportStore.getState().job?.id === job.id) useImportStore.setState({ job });
});

watchPendingTrackAfterImport(useImportStore);
