import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import type { Root } from "react-dom/client";

const window = new Window({ url: "http://localhost" });
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "DocumentFragment",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const) {
  let value = key === "window" ? window : window[key];
  if (key !== "window" && typeof value === "function" && /^[a-z]/u.test(key)) {
    value = Reflect.apply(Function.prototype.bind, value, [window]);
  }
  Object.defineProperty(globalThis, key, { configurable: true, value });
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { Button } = await import("./button");
const { Checkbox } = await import("./checkbox");
const { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } =
  await import("./dialog");
const {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} = await import("./dropdown-menu");
const {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} = await import("./select");
afterAll(() => window.close());
let root: Root;
let container: HTMLDivElement;
async function render(ui: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}
async function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element).not.toBeNull();
  await act(async () => {
    element?.click();
    await window.happyDOM.whenAsyncComplete();
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

test("dialog render composition opens and closes without nested buttons", async () => {
  await render(
    <Dialog>
      <DialogTrigger render={<Button>Open</Button>} />
      <DialogContent>
        <DialogTitle>Confirm</DialogTitle>
        <DialogClose render={<Button>Cancel</Button>} />
      </DialogContent>
    </Dialog>
  );
  expect(document.querySelector("button button")).toBeNull();
  await click('[data-slot="dialog-trigger"]');
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Confirm"
  );
  await click('[data-slot="dialog-close"]');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test("indeterminate checkbox reports a boolean when clicked", async () => {
  let checked = false;
  function onCheckedChange(value: boolean) {
    checked = value;
  }
  await render(
    <Checkbox checked={false} indeterminate onCheckedChange={onCheckedChange} />
  );
  expect(
    document.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")
  ).toBe("mixed");
  await click('[role="checkbox"]');
  expect(checked).toBe(true);
});

test("select displays the initial label before its popup is mounted and changes its value", async () => {
  const selected: Array<string | null> = [];
  function onValueChange(value: string | null) {
    selected.push(value);
  }
  await render(
    <Select
      defaultValue="a"
      items={[
        { value: "a", label: "Admin" },
        { value: "u", label: "User" },
      ]}
      onValueChange={onValueChange}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="a">Admin</SelectItem>
          <SelectItem value="u">User</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
  expect(
    document.querySelector('[data-slot="select-value"]')?.textContent
  ).toBe("Admin");
  await click('[data-slot="select-trigger"]');
  await click('[role="option"]:last-child');
  expect(selected).toEqual(["u"]);
});

test("menu item can stay open for multiple category selections", async () => {
  let clicks = 0;
  function onClick() {
    clicks += 1;
  }
  await render(
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>Filters</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuItem closeOnClick={false} onClick={onClick}>
            Category
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  await click('[data-slot="dropdown-menu-trigger"]');
  await click('[role="menuitem"]');
  expect(clicks).toBe(1);
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
});

const { useFileUpload } = await import("../../hooks/use-file-upload");

function UploadHarness({
  valid,
  oversized,
  wrongType,
}: Record<"valid" | "oversized" | "wrongType", File>) {
  const [state, actions] = useFileUpload({
    accept: "image/*",
    maxSize: 3,
    multiple: true,
  });
  return (
    <>
      <button
        data-file="valid"
        onClick={() => actions.addFiles([valid])}
        type="button"
      >
        Add
      </button>
      <button
        data-file="large"
        onClick={() => actions.addFiles([oversized])}
        type="button"
      >
        Oversized
      </button>
      <button
        data-file="type"
        onClick={() => actions.addFiles([wrongType])}
        type="button"
      >
        Wrong type
      </button>
      <button data-file="clear" onClick={actions.clearFiles} type="button">
        Clear
      </button>
      <output data-files>
        {state.files.map(({ file }) => file.name).join(",")}
      </output>
      <output data-errors>{state.errors.join(",")}</output>
    </>
  );
}

test("file upload validates size, type and duplicates and can be cleared", async () => {
  const valid = new File(["ok"], "valid.png", { type: "image/png" });
  const oversized = new File(["large"], "large.png", { type: "image/png" });
  const wrongType = new File(["x"], "text.txt", { type: "text/plain" });

  await render(
    <UploadHarness oversized={oversized} valid={valid} wrongType={wrongType} />
  );
  await click('[data-file="large"]');
  expect(document.querySelector("[data-errors]")?.textContent).toContain(
    "maximum size"
  );
  await click('[data-file="type"]');
  expect(document.querySelector("[data-errors]")?.textContent).toContain(
    "not an accepted file type"
  );
  await click('[data-file="valid"]');
  expect(document.querySelector("[data-files]")?.textContent).toBe("valid.png");
  await click('[data-file="valid"]');
  expect(document.querySelector("[data-errors]")?.textContent).toContain(
    "already added"
  );
  await click('[data-file="clear"]');
  expect(document.querySelector("[data-files]")?.textContent).toBe("");
});
