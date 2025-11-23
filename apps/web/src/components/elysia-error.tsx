import type { ElysiaAppError } from "@spice-world/web/lib/elysia";

export const ErrorItem = ({ children }: { children: React.ReactNode }) => {
	return (
		<div
			role="alert"
			aria-live="polite"
			className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
		>
			{children}
		</div>
	);
};

type BadRequestErrorProps = Extract<ElysiaErrorProps, { status: 400 }>;
const BadRequestError = (error: BadRequestErrorProps) => {
	return (
		<ErrorItem>
			<strong className="font-medium">Bad Request</strong>
			<div>
				{typeof error.value === "string"
					? error.value
					: (error.value.message ?? "There was a bad request error.")}
			</div>
		</ErrorItem>
	);
};

type NotFoundErrorProps = Extract<ElysiaErrorProps, { status: 404 }>;
const NotFoundError = (error: NotFoundErrorProps) => {
	return (
		<ErrorItem>
			<strong className="font-medium">Not Found</strong>
			<div>
				{typeof error.value === "string"
					? error.value
					: (error.value.message ?? "The requested resource was not found.")}
			</div>
		</ErrorItem>
	);
};

type ConflictErrorProps = Extract<ElysiaErrorProps, { status: 409 }>;
const ConflictError = (error: ConflictErrorProps) => {
	return (
		<ErrorItem>
			<strong className="font-medium">Conflict Error</strong>
			<div>
				{typeof error.value === "string"
					? error.value
					: (error.value.message ?? "There was a conflict error.")}
			</div>
		</ErrorItem>
	);
};

type ValidationErrorProps = Extract<ElysiaErrorProps, { status: 422 }>;
const ValidationError = (error: ValidationErrorProps) => {
	return (
		<ErrorItem>
			<strong className="font-medium">
				Validation error on {error.value.property?.replace("/", "")}
			</strong>
			<div>{error.value.summary ?? "There was a validation error."}</div>
		</ErrorItem>
	);
};

type ElysiaErrorProps = NonNullable<ElysiaAppError>;
export const ElysiaError = (error: ElysiaErrorProps) => {
	switch (error.status) {
		case 400:
			return <BadRequestError {...error} />;

		case 404:
			return <NotFoundError {...error} />;

		case 409:
			return <ConflictError {...error} />;

		case 422:
			return <ValidationError {...error} />;

		case 500:
			return (
				<ErrorItem>
					<strong className="font-medium">Internal server error</strong>
					<div>{error.value.message}</div>
				</ErrorItem>
			);

		default:
			return (
				<ErrorItem>
					<strong className="font-medium">Internal server error</strong>
					<div>An unexpected error occurred.</div>
				</ErrorItem>
			);
	}
};
