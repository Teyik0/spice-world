import { render } from "@react-email/components";
import { VerifyEmail } from "./spiceworld-welcome";

/**
 * Renders the verify email template to HTML string
 */
export const renderVerifyEmail = (props: { verifyLink: string }): string =>
  render(<VerifyEmail verifyLink={props.verifyLink} />);

// Export the component types for type safety
export interface VerifyEmailProps {
  verifyLink: string;
}

// Export all email render functions
export const emailTemplates = {
  verifyEmail: renderVerifyEmail,
} as const;
