"use client";

import React from "react";

// avoid hydration issues by rendering nothing on the server
export function ClientOnly({ children }: { children: React.ReactNode }) {
	const [hasMounted, setHasMounted] = React.useState(false);

	React.useEffect(() => {
		setHasMounted(true);
	}, []);

	if (!hasMounted) {
		return null;
	}

	return <>{children}</>;
}
