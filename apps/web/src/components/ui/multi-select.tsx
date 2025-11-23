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
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, ChevronDown, XCircle, XIcon } from "lucide-react";
import * as React from "react";

const multiSelectVariants = cva("m-1 transition-all duration-300 ease-in-out", {
	variants: {
		variant: {
			default: "border-foreground/10 text-foreground bg-card hover:bg-card/80",
			secondary:
				"border-foreground/10 bg-secondary text-secondary-foreground hover:bg-secondary/80",
			destructive:
				"border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
		},
	},
	defaultVariants: {
		variant: "default",
	},
});

export interface MultiSelectOption {
	label: string;
	value: string;
	disabled?: boolean;
}

interface MultiSelectProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, "onValueChange">,
		VariantProps<typeof multiSelectVariants> {
	options: MultiSelectOption[] | null;
	onValueChange?: (value: string[]) => void;
	defaultValue?: string[];
	placeholder?: string;
	maxCount?: number;
	className?: string;
	disabled?: boolean;
	onCreateNew?: (value: string) => Promise<MultiSelectOption | null>;
	creatable?: boolean;
}

export const MultiSelect = React.forwardRef<HTMLDivElement, MultiSelectProps>(
	(
		{
			options,
			onValueChange,
			variant,
			defaultValue = [],
			placeholder = "Select options",
			maxCount = 3,
			className,
			disabled = false,
			onCreateNew,
			creatable = false,
			...props
		},
		ref,
	) => {
		const [selectedValues, setSelectedValues] =
			React.useState<string[]>(defaultValue);
		const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
		const [searchValue, setSearchValue] = React.useState("");
		const [isCreating, setIsCreating] = React.useState(false);

		const toggleOption = (optionValue: string) => {
			if (disabled) return;
			const option = options?.find((opt) => opt.value === optionValue);
			if (option?.disabled) return;
			const newSelectedValues = selectedValues.includes(optionValue)
				? selectedValues.filter((value) => value !== optionValue)
				: [...selectedValues, optionValue];
			setSelectedValues(newSelectedValues);
			onValueChange?.(newSelectedValues);
		};

		const handleClear = () => {
			if (disabled) return;
			setSelectedValues([]);
			onValueChange?.([]);
		};

		const handleCreateNew = async () => {
			if (!onCreateNew || !searchValue.trim() || isCreating) return;
			setIsCreating(true);
			const newOption = await onCreateNew(searchValue.trim());
			setIsCreating(false);
			if (newOption) {
				const newSelectedValues = [...selectedValues, newOption.value];
				setSelectedValues(newSelectedValues);
				onValueChange?.(newSelectedValues);
				setSearchValue("");
			}
		};

		const filteredOptions = React.useMemo(() => {
			if (!searchValue) return options;
			return options?.filter(
				(option) =>
					option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
					option.value.toLowerCase().includes(searchValue.toLowerCase()),
			);
		}, [options, searchValue]);

		const showCreateOption =
			creatable &&
			searchValue.trim() &&
			!options?.some(
				(opt) => opt.label.toLowerCase() === searchValue.trim().toLowerCase(),
			);

		return (
			<Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
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
									{selectedValues.slice(0, maxCount).map((value) => {
										const option = options?.find((opt) => opt.value === value);
										if (!option) return null;

										return (
											<Badge
												key={value}
												className={cn(
													"shrink-0 whitespace-nowrap border-foreground/10 bg-card pr-0 text-foreground transition-all duration-300 ease-in-out hover:bg-card/80",
												)}
											>
												<span>{option.label}</span>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														toggleOption(value);
													}}
													aria-label={`Remove ${option.label}`}
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
						<CommandList className="max-h-[300px] overflow-y-auto">
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
							<CommandGroup>
								{filteredOptions?.map((option) => {
									const isSelected = selectedValues.includes(option.value);
									return (
										<CommandItem
											key={option.value}
											onSelect={() => toggleOption(option.value)}
											disabled={option.disabled}
											className={cn(
												"cursor-pointer",
												option.disabled && "opacity-50 cursor-not-allowed",
											)}
										>
											<div
												className={cn(
													"mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
													isSelected
														? "bg-primary text-primary-foreground"
														: "opacity-50 [&_svg]:invisible",
												)}
											>
												<CheckIcon className="h-4 w-4" />
											</div>
											<span>{option.label}</span>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		);
	},
);

MultiSelect.displayName = "MultiSelect";
