import type { PublicUser } from './auth';

export interface UserPrivacySettings {
  isPublic: boolean;
  showActivity: boolean;
  showHistory: boolean;
  showLikedTracks: boolean;
  participateLeaderboards: boolean;
}

export interface UserProfile extends PublicUser {
  followersCount: number;
  followingCount: number;
  isFollowing?: boolean;
  createdAt: string;
  privacy?: UserPrivacySettings;
  listenedDurationMs?: number | null;
  likedTracksCount?: number | null;
  relationshipUpdatedAt?: string;
}

export interface FollowState {
  isFollowing: boolean;
  followersCount: number;
  relationshipUpdatedAt?: string;
}

export interface UpdateProfileInput {
  username?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  isPublic?: boolean;
  showActivity?: boolean;
  showHistory?: boolean;
  showLikedTracks?: boolean;
  participateLeaderboards?: boolean;
}
