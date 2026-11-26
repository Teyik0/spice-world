import { atom } from "jotai";

/**
 * User item data structure used for sidebar display
 * This is a simplified version of the full user model
 */
export interface UserItemProps {
  banned: boolean | null;
  email: string | null;
  id: string;
  image: string | null;
  name: string | null;
  role: string;
}

/**
 * Atom for storing the current/new user being edited in the sidebar
 *
 * PURPOSE: Display-only state for sidebar live updates
 * - Updated FROM form state (one-way sync)
 * - Never used as source of truth for form validation
 * - Allows UserItem component to show real-time changes
 */
export const currentUserAtom = atom<UserItemProps | null>(null);
export const newUserAtom = atom<UserItemProps | null>(null);
