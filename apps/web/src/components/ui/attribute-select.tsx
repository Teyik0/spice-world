import { Badge } from "@spice-world/web/components/ui/badge";
import { Button } from "@spice-world/web/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@spice-world/web/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@spice-world/web/components/ui/popover";
import { Separator } from "@spice-world/web/components/ui/separator";
import { cn } from "@spice-world/web/lib/utils";
import { ChevronDown, Circle, CircleDot, XCircle, XIcon } from "lucide-react";
import * as React from "react";

export interface AttributeGroup {
	attributeId: string;
	attributeName: string;
	values: Array<{
		id: string;
		value: string;
	}>;
}

interface AttributeSelectProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, "onValueChange"> {
	groups: AttributeGroup[];
	onValueChange?: (value: string[]) => void;
	defaultValue?: string[];
	value?: string[];
	onBlur?: () => void;
	placeholder?: string;
	maxCount?: number;
	className?: string;
	disabled?: boolean;
	onCreateNew?: (
		value: string,
	) => Promise<{ id: string; value: string } | null>;
	creatable?: boolean;
}

export const AttributeSelect = React.forwardRef<
	HTMLDivElement,
	AttributeSelectProps
>(
	(
		{
			groups,
			onValueChange,
			defaultValue = [],
			value,
			onBlur,
			placeholder = "Select attributes",
			maxCount = 3,
			className,
			disabled = false,
			onCreateNew,
			creatable = false,
			...props
		},
		_ref,
	) => {
		const [selectedValues, setSelectedValues] =
			React.useState<string[]>(defaultValue);
		const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
		const [searchValue, setSearchValue] = React.useState("");
		const [isCreating, setIsCreating] = React.useState(false);

		// Build a map: valueId -> attributeId for quick lookup
		const valueToAttributeMap = React.useMemo(() => {
			const map = new Map<string, string>();
			for (const group of groups) {
				for (const val of group.values) {
					map.set(val.id, group.attributeId);
				}
			}
			return map;
		}, [groups]);

		// Build a map: valueId -> value label for display
		const valueToLabelMap = React.useMemo(() => {
			const map = new Map<string, string>();
			for (const group of groups) {
				for (const val of group.values) {
					map.set(val.id, val.value);
				}
			}
			return map;
		}, [groups]);

		React.useEffect(() => {
			if (value !== undefined) {
				setSelectedValues(value);
			}
		}, [value]);

		// Toggle option with single-select per attribute group behavior
		const toggleOption = (optionValueId: string) => {
			if (disabled) return;

			const attributeId = valueToAttributeMap.get(optionValueId);
			if (!attributeId) return;

			// Check if this value is already selected
			const isSelected = selectedValues.includes(optionValueId);

			let newSelectedValues: string[];

			if (isSelected) {
				// Deselect it
				newSelectedValues = selectedValues.filter((v) => v !== optionValueId);
			} else {
				// Select it, but first remove any other value from the same attribute
				newSelectedValues = selectedValues.filter((v) => {
					const vAttributeId = valueToAttributeMap.get(v);
					return vAttributeId !== attributeId;
				});
				newSelectedValues.push(optionValueId);
			}

			setSelectedValues(newSelectedValues);
			onValueChange?.(newSelectedValues);
		};

		const handleClear = () => {
			if (disabled) return;
			setSelectedValues([]);
			onValueChange?.([]);
		};

		const handleRemoveValue = (valueId: string) => {
			if (disabled) return;
			const newSelectedValues = selectedValues.filter((v) => v !== valueId);
			setSelectedValues(newSelectedValues);
			onValueChange?.(newSelectedValues);
		};

		const handleCreateNew = async () => {
			if (!onCreateNew || !searchValue.trim() || isCreating) return;
			setIsCreating(true);
			const newValue = await onCreateNew(searchValue.trim());
			setIsCreating(false);
			if (newValue) {
				const newSelectedValues = [...selectedValues, newValue.id];
				setSelectedValues(newSelectedValues);
				onValueChange?.(newSelectedValues);
				setSearchValue("");
			}
		};

		// Filter groups based on search
		const filteredGroups = React.useMemo(() => {
			if (!searchValue) return groups;
			return groups
				.map((group) => ({
					...group,
					values: group.values.filter((val) =>
						val.value.toLowerCase().includes(searchValue.toLowerCase()),
					),
				}))
				.filter((group) => group.values.length > 0);
		}, [groups, searchValue]);

		const showCreateOption =
			creatable &&
			searchValue.trim() &&
			!groups.some((group) =>
				group.values.some(
					(val) => val.value.toLowerCase() === searchValue.trim().toLowerCase(),
				),
			);

		const handlePopoverChange = (open: boolean) => {
			setIsPopoverOpen(open);
			if (!open && onBlur) {
				onBlur();
			}
		};

		return (
			<Popover open={isPopoverOpen} onOpenChange={handlePopoverChange}>
				<PopoverTrigger asChild>
					<div
						role="button"
						tabIndex={disabled ? -1 : 0}
						onClick={() => !disabled && setIsPopoverOpen((prev) => !prev)}
						onKeyDown={(e) => {
							if ((e.key === "Enter" || e.key === " ") && !disabled) {
								e.preventDefault();
								setIsPopoverOpen((prev) => !prev);
							}
						}}
						aria-disabled={disabled}
						className={cn(
							"h-9 w-full border bg-transparent p-0 font-normal shadow-xs dark:bg-input/30 dark:hover:bg-input/50 cursor-pointer rounded-md transition-colors",
							"grid grid-cols-1 items-center",
							disabled && "opacity-50 cursor-not-allowed",
							className,
						)}
						{...props}
					>
						{selectedValues.length > 0 ? (
							<div className="flex justify-between">
								<div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden px-2 py-1 min-w-0 [&::-webkit-scrollbar]:h-0">
									{selectedValues.slice(0, maxCount).map((valueId) => {
										const label = valueToLabelMap.get(valueId);
										if (!label) return null;

										return (
											<Badge
												key={valueId}
												className={cn(
													"shrink-0 whitespace-nowrap border-foreground/10 bg-card pr-0 text-foreground transition-all duration-300 ease-in-out hover:bg-card/80",
												)}
											>
												<span>{label}</span>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														handleRemoveValue(valueId);
													}}
													aria-label={`Remove ${label}`}
													className="ml-1 rounded-sm hover:bg-white/20"
												>
													<XCircle className="h-3 w-3" />
												</button>
											</Badge>
										);
									})}
									{selectedValues.length > maxCount && (
										<Badge className="shrink-0 whitespace-nowrap border-foreground/1 bg-transparent text-foreground hover:bg-transparent">
											{`+ ${selectedValues.length - maxCount} more`}
										</Badge>
									)}
								</div>
								<div className="flex items-center shrink-0">
									<Separator orientation="vertical" className="min-h-9" />
									<button
										type="button"
										onClick={(event) => {
											event.stopPropagation();
											handleClear();
										}}
										aria-label="Clear all"
										className="shrink-0 px-2 text-muted-foreground hover:text-foreground"
									>
										<XIcon className="h-4 w-4" />
									</button>
								</div>
							</div>
						) : (
							<div className="flex items-center">
								<span className="mx-3 text-sm text-muted-foreground">
									{placeholder}
								</span>
								<ChevronDown className="ml-auto mr-2 h-4 w-4 text-muted-foreground" />
							</div>
						)}
					</div>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Command>
						<CommandInput
							placeholder="Search..."
							value={searchValue}
							onValueChange={setSearchValue}
							onKeyDown={(e) => {
								if (e.key === "Enter" && showCreateOption && !isCreating) {
									e.preventDefault();
									handleCreateNew();
								}
							}}
						/>
						<CommandList className="max-h-75 overflow-y-auto">
							<CommandEmpty className="m-0 p-0">
								{showCreateOption ? (
									<Button
										type="button"
										variant="ghost"
										className="w-full justify-center rounded-none"
										onClick={handleCreateNew}
										disabled={isCreating}
									>
										{isCreating ? "Creating..." : `Create "${searchValue}"`}
									</Button>
								) : (
									<span className="text-sm flex justify-center items-center mt-2">
										No results found
									</span>
								)}
							</CommandEmpty>
							{filteredGroups.map((group, groupIndex) => (
								<React.Fragment key={group.attributeId}>
									{groupIndex > 0 && <Separator className="my-1" />}
									<CommandGroup heading={group.attributeName}>
										{group.values.map((val) => {
											const isSelected = selectedValues.includes(val.id);
											return (
												<CommandItem
													key={val.id}
													onSelect={() => toggleOption(val.id)}
													className="cursor-pointer"
												>
													<div className="mr-2 flex h-4 w-4 items-center justify-center">
														{isSelected ? (
															<CircleDot className="h-4 w-4 text-primary" />
														) : (
															<Circle className="h-4 w-4 opacity-50" />
														)}
													</div>
													<span>{val.value}</span>
												</CommandItem>
											);
										})}
									</CommandGroup>
								</React.Fragment>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		);
	},
);

AttributeSelect.displayName = "AttributeSelect";
