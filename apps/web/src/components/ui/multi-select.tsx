import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
	CheckIcon,
	XCircle,
	ChevronDown,
	XIcon,
} from "lucide-react";

import { cn } from "@spice-world/web/lib/utils";
import { Separator } from "@spice-world/web/components/ui/separator";
import { Button } from "@spice-world/web/components/ui/button";
import { Badge } from "@spice-world/web/components/ui/badge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@spice-world/web/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@spice-world/web/components/ui/command";

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
	icon?: React.ComponentType<{ className?: string }>;
	disabled?: boolean;
}

interface MultiSelectProps
	extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onValueChange">,
		VariantProps<typeof multiSelectVariants> {
	options: MultiSelectOption[];
	onValueChange: (value: string[]) => void;
	defaultValue?: string[];
	placeholder?: string;
	maxCount?: number;
	className?: string;
	disabled?: boolean;
	onCreateNew?: (value: string) => Promise<MultiSelectOption | null>;
	creatable?: boolean;
}

export const MultiSelect = React.forwardRef<HTMLButtonElement, MultiSelectProps>(
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
		ref
	) => {
		const [selectedValues, setSelectedValues] =
			React.useState<string[]>(defaultValue);
		const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
		const [searchValue, setSearchValue] = React.useState("");
		const [isCreating, setIsCreating] = React.useState(false);

		const toggleOption = (optionValue: string) => {
			if (disabled) return;
			const option = options.find((opt) => opt.value === optionValue);
			if (option?.disabled) return;
			const newSelectedValues = selectedValues.includes(optionValue)
				? selectedValues.filter((value) => value !== optionValue)
				: [...selectedValues, optionValue];
			setSelectedValues(newSelectedValues);
			onValueChange(newSelectedValues);
		};

		const handleClear = () => {
			if (disabled) return;
			setSelectedValues([]);
			onValueChange([]);
		};

		const handleCreateNew = async () => {
			if (!onCreateNew || !searchValue.trim() || isCreating) return;
			setIsCreating(true);
			const newOption = await onCreateNew(searchValue.trim());
			setIsCreating(false);
			if (newOption) {
				const newSelectedValues = [...selectedValues, newOption.value];
				setSelectedValues(newSelectedValues);
				onValueChange(newSelectedValues);
				setSearchValue("");
			}
		};

		const filteredOptions = React.useMemo(() => {
			if (!searchValue) return options;
			return options.filter(
				(option) =>
					option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
					option.value.toLowerCase().includes(searchValue.toLowerCase())
			);
		}, [options, searchValue]);

		const showCreateOption =
			creatable &&
			searchValue.trim() &&
			!options.some(
				(opt) => opt.label.toLowerCase() === searchValue.trim().toLowerCase()
			);

		return (
			<Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
				<PopoverTrigger asChild>
					<Button
						ref={ref}
						{...props}
						onClick={() => !disabled && setIsPopoverOpen((prev) => !prev)}
						disabled={disabled}
						className={cn(
							"flex p-1 rounded-md border min-h-10 h-auto items-center justify-between bg-inherit hover:bg-inherit",
							"w-full",
							disabled && "opacity-50 cursor-not-allowed",
							className
						)}
					>
						{selectedValues.length > 0 ? (
							<div className="flex justify-between items-center w-full">
								<div className="flex items-center gap-1 flex-wrap">
									{selectedValues.slice(0, maxCount).map((value) => {
										const option = options.find((opt) => opt.value === value);
										if (!option) return null;
										const IconComponent = option.icon;
										return (
											<Badge
												key={value}
												className={cn(multiSelectVariants({ variant }))}
											>
												{IconComponent && (
													<IconComponent className="h-4 w-4 mr-2" />
												)}
												<span>{option.label}</span>
												<div
													role="button"
													tabIndex={0}
													onClick={(event) => {
														event.stopPropagation();
														toggleOption(value);
													}}
													onKeyDown={(event) => {
														if (event.key === "Enter" || event.key === " ") {
															event.preventDefault();
															event.stopPropagation();
															toggleOption(value);
														}
													}}
													aria-label={`Remove ${option.label}`}
													className="ml-2 h-4 w-4 cursor-pointer hover:bg-white/20 rounded-sm"
												>
													<XCircle className="h-3 w-3" />
												</div>
											</Badge>
										);
									})}
									{selectedValues.length > maxCount && (
										<Badge
											className={cn(
												"bg-transparent text-foreground border-foreground/1 hover:bg-transparent",
												multiSelectVariants({ variant })
											)}
										>
											{`+ ${selectedValues.length - maxCount} more`}
										</Badge>
									)}
								</div>
								<div className="flex items-center justify-between">
									<div
										role="button"
										tabIndex={0}
										onClick={(event) => {
											event.stopPropagation();
											handleClear();
										}}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												event.stopPropagation();
												handleClear();
											}
										}}
										aria-label="Clear all"
										className="flex items-center justify-center h-4 w-4 mx-2 cursor-pointer text-muted-foreground hover:text-foreground"
									>
										<XIcon className="h-4 w-4" />
									</div>
									<Separator orientation="vertical" className="flex min-h-6 h-full" />
									<ChevronDown className="h-4 mx-2 cursor-pointer text-muted-foreground" />
								</div>
							</div>
						) : (
							<div className="flex items-center justify-between w-full mx-auto">
								<span className="text-sm text-muted-foreground mx-3">
									{placeholder}
								</span>
								<ChevronDown className="h-4 cursor-pointer text-muted-foreground mx-2" />
							</div>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Command>
						<CommandInput
							placeholder="Search..."
							value={searchValue}
							onValueChange={setSearchValue}
						/>
						<CommandList className="max-h-[300px] overflow-y-auto">
							<CommandEmpty>
								{showCreateOption ? (
									<div className="p-2">
										<Button
											type="button"
											variant="ghost"
											className="w-full justify-start"
											onClick={handleCreateNew}
											disabled={isCreating}
										>
											{isCreating ? "Creating..." : `Create "${searchValue}"`}
										</Button>
									</div>
								) : (
									"No results found."
								)}
							</CommandEmpty>
							<CommandGroup>
								{filteredOptions.map((option) => {
									const isSelected = selectedValues.includes(option.value);
									return (
										<CommandItem
											key={option.value}
											onSelect={() => toggleOption(option.value)}
											disabled={option.disabled}
											className={cn(
												"cursor-pointer",
												option.disabled && "opacity-50 cursor-not-allowed"
											)}
										>
											<div
												className={cn(
													"mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
													isSelected
														? "bg-primary text-primary-foreground"
														: "opacity-50 [&_svg]:invisible"
												)}
											>
												<CheckIcon className="h-4 w-4" />
											</div>
											{option.icon && (
												<option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
											)}
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
	}
);

MultiSelect.displayName = "MultiSelect";
