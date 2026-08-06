"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface AccordionProps {
  children: React.ReactNode;
  className?: string;
  type?: "single" | "multiple";
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  collapsible?: boolean;
}

interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
}

const AccordionContext = React.createContext<{
  value: string | string[];
  onValueChange: (value: string) => void;
  type: "single" | "multiple";
  collapsible: boolean;
} | null>(null);

function useAccordion() {
  const context = React.useContext(AccordionContext);
  if (!context) {
    throw new Error("Accordion components must be used within an Accordion");
  }
  return context;
}

function Accordion({
  children,
  className,
  type = "single",
  defaultValue,
  value: controlledValue,
  onValueChange,
  collapsible = true,
}: AccordionProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | string[]
  >(defaultValue || (type === "multiple" ? [] : ""));
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = React.useCallback(
    (itemValue: string) => {
      let newValue: string | string[];

      if (type === "multiple") {
        const currentValues = Array.isArray(value) ? value : [];
        if (currentValues.includes(itemValue)) {
          newValue = currentValues.filter((v) => v !== itemValue);
        } else {
          newValue = [...currentValues, itemValue];
        }
      } else {
        if (value === itemValue && collapsible) {
          newValue = "";
        } else {
          newValue = itemValue;
        }
      }

      if (!isControlled) {
        setUncontrolledValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [type, value, collapsible, isControlled, onValueChange]
  );

  return (
    <AccordionContext.Provider
      value={{ value, onValueChange: handleValueChange, type, collapsible }}
    >
      <div className={cn("divide-y divide-slate-200", className)}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

function AccordionItem({ value, children, className }: AccordionItemProps) {
  return (
    <div className={cn("", className)} data-value={value}>
      {children}
    </div>
  );
}

function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const { value, onValueChange, type } = useAccordion();
  const itemValue = React.useContext(ItemContext);
  const isOpen = type === "multiple" 
    ? Array.isArray(value) && value.includes(itemValue)
    : value === itemValue;

  return (
    <button
      type="button"
      onClick={() => onValueChange(itemValue)}
      className={cn(
        "flex w-full items-center justify-between py-4 text-left text-sm font-medium transition-all duration-150 hover:no-underline",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}

const ItemContext = React.createContext<string>("");

function AccordionContent({ children, className }: AccordionContentProps) {
  const { value, type } = useAccordion();
  const itemValue = React.useContext(ItemContext);
  const isOpen = type === "multiple" 
    ? Array.isArray(value) && value.includes(itemValue)
    : value === itemValue;

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "overflow-hidden text-sm text-slate-600 pb-4",
        className
      )}
    >
      {children}
    </div>
  );
}

// Wrapper to provide item context
function AccordionItemWrapper({ value, children, className }: AccordionItemProps) {
  return (
    <ItemContext.Provider value={value}>
      <AccordionItem value={value} className={className}>
        {children}
      </AccordionItem>
    </ItemContext.Provider>
  );
}

export {
  Accordion,
  AccordionItemWrapper as AccordionItem,
  AccordionTrigger,
  AccordionContent,
};
