import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import EmailCodeForm from "./EmailCodeForm";

const mocks = vi.hoisted(() => ({ requestCode: vi.fn(), resetPassword: vi.fn() }));
vi.mock("@/languages", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/shared/api/api", () => ({
  api: { requestEmailCode: mocks.requestCode, resetPassword: mocks.resetPassword },
  ApiError: class extends Error { code = "INVALID_EMAIL_CODE"; },
}));

it("shows password fields only after six digits and returns to the code if saving rejects it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { ApiError } = await import("@/shared/api/api");
  const onReset = vi.fn();
  const challenge = "test-challenge";
  const address = "listener@example.test";
  mocks.requestCode.mockResolvedValue({ challenge, retryAfter: 60 });
  mocks.resetPassword.mockRejectedValueOnce(new ApiError(400, "Invalid email code")).mockResolvedValueOnce(undefined);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const field = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`);
  const submit = () => act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  const type = (id: string, value: string) => act(async () => {
    const input = field(id)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  try {
    await act(async () => root.render(<EmailCodeForm purpose="reset" initialEmail={address} onBack={vi.fn()} onReset={onReset} onRegister={vi.fn()} />));
    await submit();
    expect(field("email-code")).not.toBeNull();
    expect(field("reset-password")).toBeNull();
    await type("email-code", "12345");
    await submit();
    expect(field("reset-password")).toBeNull();
    await type("email-code", "123456");
    await submit();
    expect(field("email-code")).toBeNull();
    expect(mocks.resetPassword).not.toHaveBeenCalled();

    await type("reset-password", "example-password");
    await type("reset-confirmation", "example-password");
    await submit();
    expect(field("email-code")?.value).toBe("");
    expect(container.querySelector("[role=alert]")?.textContent).toBe("login.email_code.invalid");
    await type("email-code", "654321");
    await submit();
    await submit();
    expect(mocks.resetPassword).toHaveBeenLastCalledWith(address, "example-password", { challenge, code: "654321" });
    expect(onReset).toHaveBeenCalledWith(address);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
