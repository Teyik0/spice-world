"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import { Input } from "@spice-world/web/components/ui/input";
import { Label } from "@spice-world/web/components/ui/label";
import { Switch } from "@spice-world/web/components/ui/switch";
import { Textarea } from "@spice-world/web/components/ui/textarea";

interface UserFormBanProps {
	banned: boolean;
	banReason: string;
	banExpiresInDays: number | null;
	onBannedChange: (banned: boolean) => void;
	onBanReasonChange: (reason: string) => void;
	onBanExpiresChange: (days: number | null) => void;
}

export const UserFormBan = ({
	banned,
	banReason,
	banExpiresInDays,
	onBannedChange,
	onBanReasonChange,
	onBanExpiresChange,
}: UserFormBanProps) => {
	return (
		<Card className="rounded-md border-destructive/50">
			<CardHeader>
				<CardTitle className="text-destructive">Ban Management</CardTitle>
				<CardDescription>Control user access to the platform</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label htmlFor="banned">Ban User</Label>
						<p className="text-sm text-muted-foreground">
							Prevent user from accessing the platform
						</p>
					</div>
					<Switch
						id="banned"
						checked={banned}
						onCheckedChange={onBannedChange}
					/>
				</div>

				{banned && (
					<>
						<div className="space-y-2">
							<Label htmlFor="banReason">Ban Reason</Label>
							<Textarea
								id="banReason"
								placeholder="Reason for banning this user..."
								className="min-h-20"
								value={banReason}
								onChange={(e) => onBanReasonChange(e.target.value)}
							/>
							<p className="text-xs text-muted-foreground">
								Explain why the user is being banned
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="banExpires">Ban Duration (days)</Label>
							<Input
								id="banExpires"
								type="number"
								min={0}
								placeholder="Leave empty for permanent ban"
								value={banExpiresInDays ?? ""}
								onChange={(e) => {
									const value = e.target.value;
									onBanExpiresChange(value ? Number(value) : null);
								}}
							/>
							<p className="text-xs text-muted-foreground">
								Leave empty for permanent ban
							</p>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
};
