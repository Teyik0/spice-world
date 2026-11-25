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
import {
  forwardRef,
  type HTMLAttributes,
  useEffect,
  useMemo,
  useState,
} from "react";

const multiSelectVariants = cva("m-1 transition-all duration-300 ease-in-out", {
  variants: {
    variant: {
      default: "border-foreground/10 text-foreground bg-card hover:bg-card/80",
      secondary:
        "border-foreground/10 bg-secondary text-secondary-foreground hover:bg-secondary/80",
      destructive:
        "bg-destructive text-destructive-foreground hover:bg-destructive/80 border-transparent",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface MultiSelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

interface MultiSelectProps
  extends
    Omit<HTMLAttributes<HTMLDivElement>, "onValueChange">,
    VariantProps<typeof multiSelectVariants> {
  className?: string;
  creatable?: boolean;
  defaultValue?: string[];
  disabled?: boolean;
  maxCount?: number;
  onBlur?: () => void;
  onCreateNew?: (
    value: string,
  ) => MultiSelectOption | null | Promise<MultiSelectOption | null>;
  onValueChange?: (value: string[]) => void;
  options: MultiSelectOption[] | null;
  placeholder?: string;
  value?: string[];
}

export const MultiSelect = forwardRef<HTMLDivElement, MultiSelectProps>(
  (
    {
      options,
      onValueChange,
      variant,
      defaultValue = [],
      value,
      onBlur,
      placeholder = "Select options",
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
      useState<string[]>(defaultValue);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
      if (value !== undefined) {
        setSelectedValues(value);
      }
    }, [value]);

    const toggleOption = (optionValue: string) => {
      if (disabled) {
        return;
      }
      const option = options?.find((opt) => opt.value === optionValue);
      if (option?.disabled) {
        return;
      }
      const newSelectedValues = selectedValues.includes(optionValue)
        ? selectedValues.filter(
            (selectedValue) => selectedValue !== optionValue,
          )
        : [...selectedValues, optionValue];
      setSelectedValues(newSelectedValues);
      onValueChange?.(newSelectedValues);
    };

    const handleClear = () => {
      if (disabled) {
        return;
      }
      setSelectedValues([]);
      onValueChange?.([]);
    };

    const handleCreateNew = async () => {
      if (!(onCreateNew && searchValue.trim()) || isCreating) {
        return;
      }
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

    const filteredOptions = useMemo(() => {
      if (!searchValue) {
        return options;
      }
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

    const handlePopoverChange = (open: boolean) => {
      setIsPopoverOpen(open);
      if (!open && onBlur) {
        onBlur();
      }
    };

    return (
      <Popover onOpenChange={handlePopoverChange} open={isPopoverOpen}>
        <PopoverTrigger
          nativeButton={false}
          render={
            <div
              aria-disabled={disabled}
              className={cn(
                "dark:bg-input/30 dark:hover:bg-input/50 h-9 w-full cursor-pointer rounded-md border bg-transparent p-0 font-normal shadow-xs transition-colors",
                "grid grid-cols-1 items-center",
                disabled && "cursor-not-allowed opacity-50",
                className,
              )}
              onClick={() => !disabled && setIsPopoverOpen((prev) => !prev)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !disabled) {
                  e.preventDefault();
                  setIsPopoverOpen((prev) => !prev);
                }
              }}
              role="button"
              tabIndex={disabled ? -1 : 0}
              {...props}
            >
              {selectedValues.length > 0 ? (
                <div className="flex justify-between">
                  <div className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden px-2 py-1 [&::-webkit-scrollbar]:h-0">
                    {selectedValues.slice(0, maxCount).map((selectedValue) => {
                      const option = options?.find(
                        (opt) => opt.value === selectedValue,
                      );
                      if (!option) {
                        return null;
                      }

                      return (
                        <Badge
                          className={cn(
                            "border-foreground/10 bg-card text-foreground hover:bg-card/80 shrink-0 pr-0 whitespace-nowrap transition-all duration-300 ease-in-out",
                          )}
                          key={selectedValue}
                        >
                          <span>{option.label}</span>
                          <button
                            aria-label={`Remove ${option.label}`}
                            className="ml-1 rounded-sm hover:bg-white/20"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleOption(selectedValue);
                            }}
                            type="button"
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                    {selectedValues.length > maxCount && (
                      <Badge className="border-foreground/1 text-foreground shrink-0 bg-transparent whitespace-nowrap hover:bg-transparent">
                        {`+ ${selectedValues.length - maxCount} more`}
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Separator className="min-h-9" orientation="vertical" />
                    <button
                      aria-label="Clear all"
                      className="text-muted-foreground hover:text-foreground shrink-0 px-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleClear();
                      }}
                      type="button"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center">
                  <span className="text-muted-foreground mx-3 text-sm">
                    {placeholder}
                  </span>
                  <ChevronDown className="text-muted-foreground mr-2 ml-auto h-4 w-4" />
                </div>
              )}
            </div>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Command>
            <CommandInput
              onKeyDown={(e) => {
                if (e.key === "Enter" && showCreateOption && !isCreating) {
                  e.preventDefault();
                  handleCreateNew();
                }
              }}
              onValueChange={setSearchValue}
              placeholder="Search..."
              value={searchValue}
            />
            <CommandList className="max-h-75 overflow-y-auto">
              <CommandEmpty className="m-0 p-0">
                {showCreateOption ? (
                  <Button
                    className="w-full justify-center rounded-none"
                    disabled={isCreating}
                    onClick={handleCreateNew}
                    type="button"
                    variant="ghost"
                  >
                    {isCreating ? "Creating..." : `Create "${searchValue}"`}
                  </Button>
                ) : (
                  <span className="mt-2 flex items-center justify-center text-sm">
                    No results found
                  </span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {filteredOptions?.map((option) => {
                  const isSelected = selectedValues.includes(option.value);
                  return (
                    <CommandItem
                      className={cn(
                        "cursor-pointer",
                        option.disabled && "cursor-not-allowed opacity-50",
                      )}
                      disabled={option.disabled}
                      key={option.value}
                      onSelect={() => toggleOption(option.value)}
                    >
                      <div
                        className={cn(
                          "border-primary mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
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
