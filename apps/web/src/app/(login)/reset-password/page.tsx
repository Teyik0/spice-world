import type { SearchParams } from "nuqs/server";
import { createLoader, parseAsString } from "nuqs/server";
import { ResetPasswordForm } from "./reset-password-form";

const resetPasswordSearchParams = {
	token: parseAsString,
};

const loadResetPasswordSearchParams = createLoader(resetPasswordSearchParams);

interface PageProps {
	searchParams: Promise<SearchParams>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
	const { token } = await loadResetPasswordSearchParams(searchParams);

	return <ResetPasswordForm token={token ?? undefined} />;
}
