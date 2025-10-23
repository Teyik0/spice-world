import { render } from "@react-email/components";
import { ChangeEmailVerification } from "./change-email-verification";
import { ResetPassword } from "./reset-password";
import { VerifyEmail } from "./spiceworld-welcome";

/**
 * Renders the verify email template to HTML string
 */
export const renderVerifyEmail = async (props: {
	verifyLink: string;
}): Promise<string> =>
	await render(<VerifyEmail verifyLink={props.verifyLink} />);

/**
 * Renders the reset password template to HTML string
 */
export const renderResetPassword = async (props: {
	resetLink: string;
}): Promise<string> =>
	await render(<ResetPassword resetLink={props.resetLink} />);

/**
 * Renders the change email verification template to HTML string
 */
export const renderChangeEmailVerification = async (props: {
	verifyLink: string;
}): Promise<string> =>
	await render(<ChangeEmailVerification verifyLink={props.verifyLink} />);

// Export the component types for type safety
export interface VerifyEmailProps {
	verifyLink: string;
}

export interface ResetPasswordProps {
	resetLink: string;
}

export interface ChangeEmailVerificationProps {
	verifyLink: string;
}

// Export all email render functions
export const emailTemplates = {
	verifyEmail: renderVerifyEmail,
	resetPassword: renderResetPassword,
	changeEmailVerification: renderChangeEmailVerification,
} as const;
