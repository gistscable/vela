// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  verifyTotpLoginAction: vi.fn(async (_prev: unknown, _fd: FormData): Promise<{ error?: string } | null> => null),
  completeTotpSetupAction: vi.fn(async () => null),
}));
vi.mock("@/lib/actions", () => actions);

import { TotpLoginForm } from "@/components/MfaForms";
import { buildMfaContactHints } from "@/lib/mfa-contact";

const contact = buildMfaContactHints({ email: "alice.wonder@example.com", phone: "+1 (312) 555-0192" });

const PATHS = [
  { id: "sms", testId: "mfa-method-sms", name: /Text message to phone/ },
  { id: "email", testId: "mfa-method-email", name: /Email code/ },
  { id: "app", testId: "mfa-method-app-approval", name: /Approve in First Meridian app/ },
] as const;

beforeEach(() => {
  actions.verifyTotpLoginAction.mockClear();
  actions.verifyTotpLoginAction.mockImplementation(async () => null);
});

describe("MFA method selection", () => {
  it("offers all four methods as enabled, selectable buttons with the user's masked destinations", () => {
    render(<TotpLoginForm contact={contact} />);
    for (const id of ["mfa-method-authenticator", "mfa-method-sms", "mfa-method-email", "mfa-method-app-approval"]) {
      const card = screen.getByTestId(id);
      expect(card.tagName).toBe("BUTTON");
      expect(card).toBeEnabled();
      expect(card).not.toHaveAttribute("aria-disabled");
    }
    expect(screen.queryByText("Not enabled")).toBeNull();
    expect(screen.getByTestId("mfa-sms-destination")).toHaveTextContent("Phone ending in 0192");
    expect(screen.getByTestId("mfa-email-destination")).toHaveTextContent("a•••@example.com");
    // Nothing to submit until a method is chosen.
    expect(screen.queryByLabelText("Six-digit authenticator code")).toBeNull();
    expect(screen.getByTestId("mfa-methods-notice")).toHaveTextContent("If you lose access to your authenticator, contact an administrator for a reset");
  });

  for (const path of PATHS) {
    it(`selecting "${path.id}" opens the authenticator form with a back button`, async () => {
      const user = userEvent.setup();
      render(<TotpLoginForm contact={contact} />);
      await user.click(screen.getByRole("button", { name: path.name }));

      const step = screen.getByTestId("mfa-authenticator-step");
      const code = within(step).getByLabelText("Six-digit authenticator code");
      expect(code).toHaveAttribute("name", "totpCode");
      expect(code).toHaveFocus();
      expect(within(step).getByRole("button", { name: "Verify and sign in" })).toBeInTheDocument();
      expect(within(step).getByRole("button", { name: "Back to verification methods" })).toBeInTheDocument();

      const notice = screen.getByTestId("mfa-verification-notice");
      expect(notice).toHaveTextContent("Authenticator verification");
      expect(notice).toHaveTextContent("Open Google Authenticator and enter the current six-digit code");
      expect(notice.textContent).not.toMatch(/temporarily|not available yet|was sent|will be sent/i);

      // The method list is gone, and choosing alone sent nothing to the server.
      expect(screen.queryByTestId("mfa-method-sms")).toBeNull();
      expect(actions.verifyTotpLoginAction).not.toHaveBeenCalled();
    });
  }

  it("keeps the masked destination visible for the chosen method, with no full contact values", async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<TotpLoginForm contact={contact} />);
    await user.click(screen.getByTestId("mfa-method-sms"));
    expect(screen.getByTestId("mfa-selected-destination")).toHaveTextContent("Text message to phone ending in 0192");
    expect(screen.getByTestId("mfa-verification-notice")).toHaveTextContent("You selected:");
    expect(screen.getByTestId("mfa-verification-notice")).not.toHaveTextContent("not verified");
    await user.click(screen.getByTestId("mfa-back"));
    await user.click(screen.getByTestId("mfa-method-email"));
    expect(screen.getByTestId("mfa-selected-destination")).toHaveTextContent("a•••@example.com");
    for (const full of ["alice.wonder", "alice.wonder@example.com", "312", "555-0192", "5550192"]) {
      expect(container.innerHTML).not.toContain(full);
    }
    unmount();
  });

  it("states honestly when a destination is missing", async () => {
    const user = userEvent.setup();
    render(<TotpLoginForm contact={buildMfaContactHints({ email: "a@example.com", phone: null })} />);
    expect(screen.getByTestId("mfa-sms-destination")).toHaveTextContent("No phone number registered");
    await user.click(screen.getByTestId("mfa-method-sms"));
    expect(screen.getByTestId("mfa-selected-destination")).toHaveTextContent("No phone number registered");
    expect(screen.getByTestId("mfa-verification-notice")).not.toHaveTextContent("was sent");
  });

  it("the Authenticator app option goes straight to the same form", async () => {
    const user = userEvent.setup();
    render(<TotpLoginForm contact={contact} />);
    await user.click(screen.getByTestId("mfa-method-authenticator"));
    expect(screen.getByLabelText("Six-digit authenticator code")).toBeInTheDocument();
    expect(screen.getByTestId("mfa-verification-notice")).toHaveTextContent("Authenticator verification");
    expect(screen.getByRole("button", { name: "Back to verification methods" })).toBeInTheDocument();
  });

  it("Back returns to the method list, restores focus to the chosen method, and clears the code form", async () => {
    const user = userEvent.setup();
    render(<TotpLoginForm contact={contact} />);
    for (const path of PATHS) {
      await user.click(screen.getByTestId(path.testId));
      await user.type(screen.getByLabelText("Six-digit authenticator code"), "12");
      await user.click(screen.getByRole("button", { name: "Back to verification methods" }));
      expect(screen.queryByLabelText("Six-digit authenticator code")).toBeNull();
      expect(screen.getByRole("heading", { name: "Choose a verification method" })).toBeInTheDocument();
      expect(screen.getByTestId(path.testId)).toHaveFocus();
      expect(screen.getByTestId("mfa-sms-destination")).toHaveTextContent("Phone ending in 0192");
    }
    // Reopening starts with an empty code field, never a stale partial code.
    await user.click(screen.getByTestId("mfa-method-sms"));
    expect((screen.getByLabelText("Six-digit authenticator code") as HTMLInputElement).value).toBe("");
    expect(actions.verifyTotpLoginAction).not.toHaveBeenCalled();
  });

  for (const path of PATHS) {
    it(`submitting the code after choosing "${path.id}" calls the server verification action with the typed code`, async () => {
      const user = userEvent.setup();
      render(<TotpLoginForm contact={contact} />);
      await user.click(screen.getByTestId(path.testId));
      await user.type(screen.getByLabelText("Six-digit authenticator code"), "123456");
      await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
      expect(actions.verifyTotpLoginAction).toHaveBeenCalledTimes(1);
      const [, formData] = actions.verifyTotpLoginAction.mock.calls[0];
      expect(Object.fromEntries(formData as FormData)).toEqual({ totpCode: "123456" });
    });
  }

  it("shows a server rejection and stays on the code form", async () => {
    actions.verifyTotpLoginAction.mockImplementation(async () => ({ error: "That code didn't match." }));
    const user = userEvent.setup();
    render(<TotpLoginForm contact={contact} />);
    await user.click(screen.getByTestId("mfa-method-email"));
    await user.type(screen.getByLabelText("Six-digit authenticator code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByText("That code didn't match.")).toBeInTheDocument();
    expect(screen.getByLabelText("Six-digit authenticator code")).toBeInTheDocument();
  });
});
