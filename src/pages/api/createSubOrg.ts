import type { NextApiRequest, NextApiResponse } from "next";
import { Turnkey, TurnkeyApiTypes } from "@turnkey/sdk-server";
import { refineNonNull } from "@/utils";
import { TWalletDetails } from "@/types";

import { DEFAULT_SOLANA_ACCOUNTS } from "@turnkey/sdk-server";

type TAttestation = TurnkeyApiTypes["v1Attestation"];

type CreateSubOrgWithPrivateKeyRequest = {
  email: string;
  userName: string;
  subOrgName: string;
  challenge: string;
  attestation: TAttestation;
};

type ErrorMessage = {
  message: string;
};

export default async function createUser(
  req: NextApiRequest,
  res: NextApiResponse<TWalletDetails | ErrorMessage>
) {
  const createSubOrgRequest = req.body as CreateSubOrgWithPrivateKeyRequest;

  try {
    console.log("Prepare to create suborg ", createSubOrgRequest);
    const turnkey = new Turnkey({
      apiBaseUrl: process.env.NEXT_PUBLIC_BASE_URL!,
      apiPrivateKey: process.env.API_PRIVATE_KEY!,
      apiPublicKey: process.env.API_PUBLIC_KEY!,
      defaultOrganizationId: process.env.NEXT_PUBLIC_ORGANIZATION_ID!,
    });

    const apiClient = turnkey.apiClient();

    const walletName = `Default ETH Wallet`;

    const createSubOrgResponse = await apiClient.createSubOrganization({
      subOrganizationName: createSubOrgRequest.subOrgName,
      rootQuorumThreshold: 1,
      rootUsers: [
        {
          userName: createSubOrgRequest.userName,
          userEmail: createSubOrgRequest.email,
          apiKeys: [],
          authenticators: [
            {
              authenticatorName: "Passkey",
              challenge: createSubOrgRequest.challenge,
              attestation: createSubOrgRequest.attestation,
            },
          ],
          oauthProviders: [],
        },
      ],
      wallet: {
        walletName: walletName,
        accounts: DEFAULT_SOLANA_ACCOUNTS,
      },
    });

    const subOrgId = refineNonNull(createSubOrgResponse.subOrganizationId);
    const wallet = refineNonNull(createSubOrgResponse.wallet);

    const walletId = wallet.walletId;
    const walletAddress = wallet.addresses[0];

    res.status(200).json({
      id: walletId,
      address: walletAddress,
      subOrgId: subOrgId,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      message: "Something went wrong.",
    });
  }
}
