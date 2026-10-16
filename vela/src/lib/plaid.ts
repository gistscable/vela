import "server-only";

export function plaidCredentials() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const environment = process.env.PLAID_ENV ?? "sandbox";
  // Real institution credentials are deliberately disabled in this fictional demo.
  const ready = Boolean(clientId && secret && environment === "sandbox");
  return { ready, environment };
}

/** Load the generated Plaid SDK only on the account-linking API routes. */
export async function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const { ready } = plaidCredentials();
  if (!ready || !clientId || !secret) return null;

  const { Configuration, PlaidApi, PlaidEnvironments } = await import("plaid");
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    }),
  );
}
