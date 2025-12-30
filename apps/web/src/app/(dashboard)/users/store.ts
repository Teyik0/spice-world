import { atom } from "jotai";

/**
 * User item data structure used for sidebar display
 * This is a simplified version of the full user model
 */
export interface UserItemProps {
	id: string;
	name: string | null;
	email: string | null;
	image: string | null;
	role: string;
	banned: boolean | null;
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
