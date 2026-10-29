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
  className?: string;
  creatable?: boolean;
  defaultValue?: string[];
  disabled?: boolean;
  groups: AttributeGroup[];
  maxCount?: number;
  onBlur?: () => void;
  onCreateNew?: (
    value: string
  ) => Promise<{ id: string; value: string } | null>;
  onValueChange?: (value: string[]) => void;
  placeholder?: string;
  value?: string[];
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
    _ref
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
      if (disabled) {
        return;
      }

      const attributeId = valueToAttributeMap.get(optionValueId);
      if (!attributeId) {
        return;
      }

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
      if (disabled) {
        return;
      }
      setSelectedValues([]);
      onValueChange?.([]);
    };

    const handleRemoveValue = (valueId: string) => {
      if (disabled) {
        return;
      }
      const newSelectedValues = selectedValues.filter((v) => v !== valueId);
      setSelectedValues(newSelectedValues);
      onValueChange?.(newSelectedValues);
    };

    const handleCreateNew = async () => {
      if (!(onCreateNew && searchValue.trim()) || isCreating) {
        return;
      }
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
      if (!searchValue) {
        return groups;
      }
      return groups
        .map((group) => ({
          ...group,
          values: group.values.filter((val) =>
            val.value.toLowerCase().includes(searchValue.toLowerCase())
          ),
        }))
        .filter((group) => group.values.length > 0);
    }, [groups, searchValue]);

    const showCreateOption =
      creatable &&
      searchValue.trim() &&
      !groups.some((group) =>
        group.values.some(
          (val) => val.value.toLowerCase() === searchValue.trim().toLowerCase()
        )
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
          render={
            <div
              aria-disabled={disabled}
              className={cn(
                "dark:bg-input/30 dark:hover:bg-input/50 h-9 w-full cursor-pointer rounded-md border bg-transparent p-0 font-normal shadow-xs transition-colors",
                "grid grid-cols-1 items-center",
                disabled && "cursor-not-allowed opacity-50",
                className
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
                    {selectedValues.slice(0, maxCount).map((valueId) => {
                      const label = valueToLabelMap.get(valueId);
                      if (!label) {
                        return null;
                      }

                      return (
                        <Badge
                          className={cn(
                            "border-foreground/10 bg-card text-foreground hover:bg-card/80 shrink-0 pr-0 whitespace-nowrap transition-all duration-300 ease-in-out"
                          )}
                          key={valueId}
                        >
                          <span>{label}</span>
                          <button
                            aria-label={`Remove ${label}`}
                            className="ml-1 rounded-sm hover:bg-white/20"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveValue(valueId);
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
              {filteredGroups.map((group, groupIndex) => (
                <React.Fragment key={group.attributeId}>
                  {groupIndex > 0 && <Separator className="my-1" />}
                  <CommandGroup heading={group.attributeName}>
                    {group.values.map((val) => {
                      const isSelected = selectedValues.includes(val.id);
                      return (
                        <CommandItem
                          className="cursor-pointer"
                          key={val.id}
                          onSelect={() => toggleOption(val.id)}
                        >
                          <div className="mr-2 flex h-4 w-4 items-center justify-center">
                            {isSelected ? (
                              <CircleDot className="text-primary h-4 w-4" />
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
  }
);

AttributeSelect.displayName = "AttributeSelect";
